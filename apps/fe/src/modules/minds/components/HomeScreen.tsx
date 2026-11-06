"use client"

import Link from "next/link"
import { useNearWallet } from "near-connect-hooks"
import { Button } from "@/components/ui/button"

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
      {/* Temporary way in to the app shell while the sign-in flow (L1 to L3) is built. */}
      <Button render={<Link href="/minds/penny/chat" />}>Open Penny (sample)</Button>
    </section>
  )
}
