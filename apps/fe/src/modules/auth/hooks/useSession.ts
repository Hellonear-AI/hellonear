"use client"

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useNearWallet } from "near-connect-hooks"
import { ApiError } from "@/lib/api"
import { authApi, nonceBytes, type SessionUser } from "@/modules/auth/api"
import { rememberLeftMinds } from "@/modules/auth/data/leftMinds"

export const sessionKey = ["session"] as const

/** The backend session (`hn_session` cookie): the user, or `null` when signed out. */
export function useSession() {
  return useQuery<SessionUser | null>({
    queryKey: sessionKey,
    queryFn: async () => {
      try {
        return (await authApi.me()).user
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  })
}

/**
 * Sign in (NEP-413): connect a wallet if none is connected (Meteor is first in the picker),
 * get a challenge, let the wallet sign exactly `{ message, recipient, nonce }`, then log in.
 * The backend checks the key is a full-access key of the account and sets the cookie.
 */
export function useSignIn() {
  const { connector, signedAccountId } = useNearWallet()
  const queryClient = useQueryClient()

  return useMutation({
    /** `walletId` opens that wallet straight away (Meteor's button, L1); without it, the NEAR Connect list. */
    mutationFn: async ({ walletId }: { walletId?: string } = {}) => {
      // Use the connector directly: the hook's own signer reads wallet state from the last
      // render, so right after connecting it would still say "not connected".
      const wallet = walletId ? await connector.connect({ walletId }) : signedAccountId ? await connector.wallet() : await connector.connect()
      const challenge = await authApi.challenge()
      const signed = await wallet.signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: nonceBytes(challenge.nonce),
      })
      const { user } = await authApi.login({
        accountId: signed.accountId,
        publicKey: signed.publicKey,
        signature: signed.signature,
        nonce: challenge.nonce,
      })
      return user
    },
    onSuccess: (user) => {
      rememberAccount(user.nearAccountId)
      queryClient.setQueryData(sessionKey, user)
    },
  })
}

/** Try without a wallet (T1.1): a fresh try-out user and its cookie. */
export function useDemoSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => (await authApi.demo()).user,
    onSuccess: (user) => queryClient.setQueryData(sessionKey, user),
  })
}

// "Welcome back" (L1.4): the last wallet account that signed in on this browser. Only the account
// name, which is public; signing in again still asks the wallet.
const LAST_ACCOUNT_KEY = "hellonear.lastAccount"

export function rememberAccount(accountId: string) {
  try {
    window.localStorage.setItem(LAST_ACCOUNT_KEY, accountId)
  } catch {
    // Storage can be blocked; the screen then shows the first-visit version.
  }
}

export function lastAccount(): string | null {
  try {
    return window.localStorage.getItem(LAST_ACCOUNT_KEY)
  } catch {
    return null
  }
}

/**
 * Leave a try-out for a real wallet (T1.3, T1.4, T1.5): end the try-out session and go back to
 * sign-in, where Meteor is the main choice. Nothing from the try-out carries over.
 */
export function useLeaveTryOut() {
  const signOut = useSignOut()
  const router = useRouter()
  return () => signOut.mutate(undefined, { onSettled: () => router.replace("/") })
}

/**
 * "Connect Meteor" from a try-out (T1.4): opens Meteor right away, in the same click. A wallet
 * login replaces the try-out's session cookie (`POST /auth/login` sets a new one), so there is no
 * sign-out first. Then a full reload to `/`, which opens the account's newest Mind, so nothing
 * cached from the try-out is shown.
 */
export function useSwitchToWallet() {
  const signIn = useSignIn()
  const queryClient = useQueryClient()
  return {
    start: () => {
      // Read before the login: the cache still holds the try-out's Minds.
      const ids = cachedMindIds(queryClient)
      signIn.mutate(
        { walletId: "meteor-wallet" },
        {
          onSuccess: () => {
            rememberLeftMinds(ids)
            window.location.replace("/")
          },
        }
      )
    },
    // Stays pending through the reload, so the button keeps saying "Waiting for Meteor".
    isPending: signIn.isPending || signIn.isSuccess,
    error: signIn.error,
    reset: signIn.reset,
  }
}

/** End the backend session, disconnect the wallet, and drop every cached response. */
export function useSignOut() {
  const { signOut } = useNearWallet()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await authApi.logout().catch(() => undefined) // signed out either way
      await signOut().catch(() => undefined)
    },
    onSettled: () => {
      rememberLeftMinds(cachedMindIds(queryClient))
      queryClient.clear()
      queryClient.setQueryData(sessionKey, null)
    },
  })
}

/** Short, plain reasons for a failed sign-in (wallet closed, nonce expired, wrong key...). */
export function signInErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "invalid_nonce") return "The sign-in request expired. Please try again."
    if (err.code === "invalid_signature") return "The wallet's signature was not accepted. Use a full-access key of this account."
    if (err.code === "bad_origin") return "This address is not allowed to sign in to the backend."
    return "Couldn't reach HelloNear. Please try again."
  }
  return "The wallet didn't sign the request."
}

/** The Mind ids the cache holds for the session that is ending (`["minds"]`, see `mindKeys.all`). */
function cachedMindIds(queryClient: QueryClient): string[] {
  return (queryClient.getQueryData<{ mindId: string }[]>(["minds"]) ?? []).map((m) => m.mindId)
}
