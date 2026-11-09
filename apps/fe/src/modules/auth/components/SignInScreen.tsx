"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { ArrowRightIcon, CircleXIcon, FlaskConicalIcon, GlobeIcon, KeyRoundIcon, Loader2Icon, WalletMinimalIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { cn } from "cn"
import { MeteorLogo } from "@/components/elements/AppLogos"
import { Logo } from "@/components/elements/Logo"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { mindHref } from "@/components/layout/nav"
import { ApiError } from "@/lib/api"
import { lastAccount, signInErrorMessage, useDemoSignIn, useSession, useSignIn } from "@/modules/auth/hooks/useSession"
import { useMinds } from "@/modules/minds/hooks/useMinds"

const METEOR = "meteor-wallet"

/**
 * Sign in (design "3 · Start", L1 and T1.1). Meteor is the main choice and opens straight away;
 * "Other NEAR wallets" opens the NEAR Connect list; "Try without a wallet" sits under them after a
 * divider. Once signed in, it opens the newest Mind, or Choose a Mind when there is none.
 */
export function SignInScreen() {
  const router = useRouter()
  const session = useSession()
  const minds = useMinds()
  const signIn = useSignIn()
  const demo = useDemoSignIn()
  const [returning, setReturning] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [picked, setPicked] = useState<"meteor" | "other" | null>(null)

  // The last account is read after mount, so the server and first client render match.
  useEffect(() => {
    const account = lastAccount()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of localStorage
    if (account) setReturning(account)
  }, [])

  const user = session.data
  useEffect(() => {
    if (!user || !minds.data) return
    const newest = minds.data[0]
    router.replace(newest ? mindHref(newest.mindId) : "/minds/new")
  }, [user, minds.data, router])

  const busy = signIn.isPending || demo.isPending
  const error = signIn.error ? walletError(signIn.error) : demo.error ? demoError(demo.error) : null

  function withWallet(which: "meteor" | "other") {
    setPicked(which)
    demo.reset()
    signIn.mutate(which === "meteor" ? { walletId: METEOR } : {})
  }

  if (user && minds.isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm text-muted-foreground">You&apos;re signed in, but your Minds didn&apos;t load. Check your connection and try again.</p>
        <Button variant="outline" onClick={() => void minds.refetch()}>
          Try again
        </Button>
      </div>
    )
  }
  if (session.isPending || user) {
    return <div aria-busy="true" className="min-h-dvh bg-background" />
  }

  return (
    <div className="flex min-h-dvh bg-background lg:p-4">
      <aside className="relative hidden w-[42%] max-w-[600px] shrink-0 overflow-hidden rounded-xl bg-muted lg:block">
        <Image src="/sign-in/forest.jpg" alt="" fill priority sizes="600px" className="object-cover" />
        <div className="absolute bottom-4 left-4 flex max-w-[340px] flex-col gap-1 rounded-lg bg-white/90 px-4 py-3 text-[#161614]">
          <p className="text-[15px] font-semibold">Your limits stay yours.</p>
          <p className="text-[13px] text-[#5c5a54]">Even if someone tricks your Mind, it can&apos;t spend more than you allow.</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col px-4 py-5 md:px-10 lg:px-16">
        <div className="flex items-center justify-between gap-3">
          <Logo height={28} />
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="rounded-sm text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
          >
            What is a Mind?
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center gap-7 py-10">
          <div className="flex flex-col gap-3">
            <h1 className="text-[40px] leading-[1.05] font-medium tracking-[-1.2px] text-foreground md:text-[52px]">
              {returning ? "Welcome back." : "Meet your Mind."}
            </h1>
            <p className="text-[15px] text-muted-foreground md:text-base">
              {returning
                ? "Your Mind is waiting. Sign in with the same wallet to continue."
                : "An AI helper with its own wallet. You set the limits, and it can't go past them."}
            </p>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-md bg-danger-soft px-3.5 py-3 text-sm text-foreground">
              <CircleXIcon className="mt-0.5 size-4 shrink-0 text-danger" />
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <Option
              onClick={() => withWallet("meteor")}
              disabled={busy}
              strong
              icon={signIn.isPending && picked === "meteor" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <MeteorLogo className="size-6" />}
              logoTile
              title={signIn.isPending && picked === "meteor" ? "Waiting for Meteor" : returning ? "Continue with Meteor" : "Meteor Wallet"}
              note={
                signIn.isPending && picked === "meteor"
                  ? "Approve the sign-in in the Meteor window."
                  : returning ?? "Recommended. We test every feature with it."
              }
              noteMono={Boolean(returning) && !(signIn.isPending && picked === "meteor")}
            />
            <Option
              onClick={() => withWallet("other")}
              disabled={busy}
              icon={signIn.isPending && picked === "other" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <WalletMinimalIcon />}
              title={signIn.isPending && picked === "other" ? "Waiting for your wallet" : "Other NEAR wallets"}
            />

            <div className="flex items-center gap-3 py-1 text-xs text-tertiary-foreground" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>

            <Option
              onClick={() => {
                signIn.reset()
                demo.mutate()
              }}
              disabled={busy}
              icon={demo.isPending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <FlaskConicalIcon />}
              title="Try without a wallet"
              note="No sign-up. 20 messages and a shared test wallet. Deleted after 7 days."
            />
          </div>

          <ul className="flex flex-col gap-2 text-[13px] text-muted-foreground">
            <li className="flex items-center gap-2">
              <KeyRoundIcon className="size-3.5 shrink-0" />
              We never see your keys. Signing in is free.
            </li>
            <li className="flex items-center gap-2">
              <GlobeIcon className="size-3.5 shrink-0" />
              Running on NEAR testnet. No real money.
            </li>
          </ul>
        </div>

        <p className="text-xs text-tertiary-foreground">Nothing here is financial advice.</p>
      </main>

      <AboutMind open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  )
}

function Option({
  onClick,
  disabled,
  icon,
  title,
  note,
  noteMono,
  strong,
  logoTile,
}: {
  onClick: () => void
  disabled: boolean
  icon: ReactNode
  title: string
  note?: string
  /** The remembered account is an address, the one place mono is allowed. */
  noteMono?: boolean
  /** The main choice gets the darker edge (Meteor). */
  strong?: boolean
  /** A brand logo sits on a light tile, the way it's drawn, instead of the dark icon tile. */
  logoTile?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-lg border bg-surface px-4 py-3.5 text-left outline-none transition-[border-color,background-color,transform] duration-150 ease-out hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] disabled:opacity-60 motion-reduce:active:scale-100",
        strong ? "border-foreground" : "border-border"
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          logoTile ? "bg-white text-[#161614] ring-1 ring-border" : "bg-primary text-primary-foreground [&>svg]:size-[18px]"
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-foreground">{title}</span>
        {note && <span className={cn("truncate text-[13px] text-muted-foreground", noteMono && "font-mono")}>{note}</span>}
      </span>
      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </button>
  )
}

/** L1.5: three plain points, no sign-in needed to read them. */
function AboutMind({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const points = [
    { title: "It talks with you", text: "Ask in plain words. It remembers what matters to you and shows every step it takes." },
    { title: "It has its own wallet", text: "A small NEAR wallet, separate from yours. You decide how much goes in." },
    {
      title: "It can't go past your limits",
      text: "You set what it may spend and who it may pay. Those rules are saved where the Mind can't change them, so even a tricked Mind can't overspend.",
    },
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>What is a Mind?</DialogTitle>
          <DialogDescription>An AI helper that can do things for you, including pay.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {points.map((p) => (
            <li key={p.title} className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">{p.title}</span>
              <span className="text-[13px] text-muted-foreground">{p.text}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">HelloNear runs on NEAR testnet, so nothing here is real money.</p>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** L1.3: say what happened and that nothing changed; the same button works again. */
export function walletError(err: unknown): string {
  if (err instanceof ApiError) return signInErrorMessage(err)
  return "Sign-in was canceled in the wallet. Nothing changed."
}

/** T1.2 and a backend without try-out mode. */
export function demoError(err: unknown): string {
  if (err instanceof ApiError && err.code === "demo_rate_limited") return "Too many try-outs from this network in the last hour. Try again later, or connect a wallet."
  if (err instanceof ApiError && err.status === 404) return "Try-out isn't available right now. Connect a wallet instead."
  return "Couldn't start a try-out. Try again in a moment."
}
