"use client"

import { notFound, useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { leftMinds } from "@/modules/auth/data/leftMinds"
import { useSession } from "@/modules/auth/hooks/useSession"
import { useMinds } from "@/modules/minds/hooks/useMinds"

/**
 * Mind screens need a backend session and a Mind that belongs to the user.
 * Checked in the browser: on the hosted site the session cookie belongs to the API's host,
 * so the web app's server can't see it.
 * - no session: back to sign in (`/`);
 * - a Mind of a session that ended in this tab (Back after sign out, leaving a try-out or
 *   Connect Meteor): to `/`, which opens the current account's newest Mind (Ancung, 9 Nov);
 * - not one of the user's Minds (unknown, deleted, someone else's): the not-found page (E1.3).
 */
export function MindGate({ mindId, children }: { mindId: string; children: ReactNode }) {
  const router = useRouter()
  const session = useSession()
  const minds = useMinds()
  const signedOut = session.isSuccess && !session.data
  const missing = Boolean(minds.data && !minds.data.some((m) => m.mindId === mindId))
  // Read only once the Mind is missing, so the first render doesn't touch sessionStorage.
  const left = missing && leftMinds().includes(mindId)

  useEffect(() => {
    if (signedOut || left) router.replace("/")
  }, [signedOut, left, router])

  if (session.isError || minds.isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">Couldn&apos;t reach HelloNear. Check your connection and try again.</p>
        <Button variant="outline" onClick={() => void (session.isError ? session.refetch() : minds.refetch())}>
          Try again
        </Button>
      </div>
    )
  }

  // Quiet blank page while the session and Minds load (no flash of the shell).
  if (!session.data || !minds.data || left) return <div className="min-h-dvh bg-background" aria-busy="true" />

  if (missing) notFound()
  return children
}
