"use client"

import { useNearWallet } from "near-connect-hooks"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { signInErrorMessage, useSession, useSignIn, useSignOut } from "@/modules/auth/hooks/useSession"

/** Header control for public pages: sign in with a wallet, or show who is signed in. */
export function SignInButton() {
  const { loading: walletLoading } = useNearWallet()
  const session = useSession()
  const signIn = useSignIn()
  const signOut = useSignOut()

  if (walletLoading || session.isPending) {
    return (
      <Button variant="outline" disabled>
        Loading
      </Button>
    )
  }

  const user = session.data
  if (!user) {
    return (
      <Button
        disabled={signIn.isPending}
        onClick={() =>
          signIn.mutate(undefined, { onError: (err) => toast.error(signInErrorMessage(err)) })
        }
      >
        {signIn.isPending ? "Waiting for wallet" : "Sign in with wallet"}
      </Button>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={user.nearAccountId}>
        {user.nearAccountId}
      </span>
      <Button variant="outline" className="shrink-0" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
        Sign out
      </Button>
    </div>
  )
}
