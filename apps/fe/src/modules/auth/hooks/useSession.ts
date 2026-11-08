"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNearWallet } from "near-connect-hooks"
import { ApiError } from "@/lib/api"
import { authApi, nonceBytes, type SessionUser } from "@/modules/auth/api"

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
    mutationFn: async () => {
      // Use the connector directly: the hook's own signer reads wallet state from the last
      // render, so right after connecting it would still say "not connected".
      const wallet = signedAccountId ? await connector.wallet() : await connector.connect()
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
    onSuccess: (user) => queryClient.setQueryData(sessionKey, user),
  })
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
