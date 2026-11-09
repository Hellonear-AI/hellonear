"use client"

import Link from "next/link"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"

/** The end of the Google sign-in window: close it if we can, else point back to HelloNear. */
export function ConnectReturn() {
  useEffect(() => {
    // Only a window a script opened can close itself; otherwise nothing happens and the text stays.
    window.close()
  }, [])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <h1 className="text-xl font-medium text-foreground">You&apos;re done with Google</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        You can close this window. HelloNear checks the connection by itself and updates the page you came from.
      </p>
      <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
        Back to HelloNear
      </Button>
    </main>
  )
}
