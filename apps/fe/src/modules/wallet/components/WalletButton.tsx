"use client"

import { useNearWallet } from "near-connect-hooks"
import { Button } from "@/components/ui/button"

export function WalletButton() {
  const { loading, signedAccountId, signIn, signOut } = useNearWallet()

  if (loading) {
    return (
      <Button variant="outline" disabled>
        Loading
      </Button>
    )
  }

  if (!signedAccountId) {
    return <Button onClick={() => void signIn()}>Connect wallet</Button>
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate text-sm text-muted-foreground" title={signedAccountId}>
        {signedAccountId}
      </span>
      <Button variant="outline" className="shrink-0" onClick={() => void signOut()}>
        Log out
      </Button>
    </div>
  )
}
