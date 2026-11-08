import Link from "next/link"
import type { ReactNode } from "react"
import { SignInButton } from "@/modules/auth/components/SignInButton"

// Frame for pages outside a Mind (sign in for now). Replaced by the L1 sign-in screen.
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="shrink-0 text-base font-semibold">
            HelloNear
          </Link>
          <SignInButton />
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  )
}
