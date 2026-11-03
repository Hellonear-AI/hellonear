"use client"

import { useNearWallet } from "near-connect-hooks"

export function HomeScreen() {
  const { signedAccountId } = useNearWallet()

  return (
    <section className="max-w-xl space-y-2">
      <h1 className="text-2xl font-semibold">Welcome to HelloNear</h1>
      <p className="text-muted-foreground">
        {signedAccountId
          ? `You are signed in as ${signedAccountId}.`
          : "Connect your NEAR wallet on the test network to get started."}
      </p>
    </section>
  )
}
