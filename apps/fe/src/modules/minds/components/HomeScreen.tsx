"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useSession } from "@/modules/auth/hooks/useSession"
import { useMinds } from "@/modules/minds/hooks/useMinds"
import { mindHref } from "@/components/layout/nav"

// Temporary home until the sign-in screens (L1 to L3) are built.
export function HomeScreen() {
  const { data: user } = useSession()
  const { data: minds, isPending } = useMinds()
  const latest = minds?.[0] // newest first

  return (
    <section className="max-w-xl space-y-3">
      <h1 className="text-2xl font-semibold">Welcome to HelloNear</h1>
      <p className="text-muted-foreground">
        {user
          ? `You are signed in as ${user.nearAccountId}.`
          : "Sign in with your NEAR wallet on the test network to get started."}
      </p>
      {user && !isPending && (
        <div className="flex flex-wrap gap-2">
          {latest ? (
            <Button nativeButton={false} render={<Link href={mindHref(latest.mindId)} />}>Open {latest.name}</Button>
          ) : (
            <Button nativeButton={false} render={<Link href="/minds/new" />}>Create your first Mind</Button>
          )}
        </div>
      )}
    </section>
  )
}
