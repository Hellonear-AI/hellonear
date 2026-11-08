"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useSession } from "@/modules/auth/hooks/useSession"

export function HomeScreen() {
  const { data: user } = useSession()

  return (
    <section className="max-w-xl space-y-2">
      <h1 className="text-2xl font-semibold">Welcome to HelloNear</h1>
      <p className="text-muted-foreground">
        {user
          ? `You are signed in as ${user.nearAccountId}.`
          : "Sign in with your NEAR wallet on the test network to get started."}
      </p>
      {/* Temporary way in to the app shell while the sign-in screens (L1 to L3) are built. */}
      <Button render={<Link href="/minds/penny/chat" />}>Open Penny (sample)</Button>
    </section>
  )
}
