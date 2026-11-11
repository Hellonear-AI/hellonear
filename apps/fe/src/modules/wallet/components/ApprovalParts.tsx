"use client"

import Link from "next/link"
import { CheckIcon, PlusIcon, SnowflakeIcon, XIcon } from "lucide-react"
import { cn } from "cn"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"
import { mindHref } from "@/components/layout/nav"
import type { ApprovalDetails } from "@/modules/runs/data/approvalDetails"
import type { Check, NextStep } from "@/modules/wallet/data/checks"

// The pieces every approval card shares (the chat's card, Approvals, the Attack Playground), so
// they read the same checks and offer the same next step. Each place keeps its own frame.

/** What OutLayer will check before signing, said in advance (`approvalChecks`). */
export function ApprovalCheckList({ checks, large = false }: { checks: Check[]; large?: boolean }) {
  if (checks.length === 0) return null
  const icon = large ? "size-4" : "size-3.5"
  return (
    <ul className={cn("flex flex-col", large ? "gap-2" : "gap-1.5")}>
      {checks.map((c) => (
        <li key={c.text} className="flex items-center gap-2 text-[13px] text-foreground">
          {c.ok ? <CheckIcon className={cn(icon, "shrink-0 text-success")} /> : <XIcon className={cn(icon, "shrink-0 text-danger")} />}
          {c.text}
        </li>
      ))}
    </ul>
  )
}

/**
 * Decline, and Approve only when nothing would refuse it; otherwise the button leads to the fix
 * (A1): Unfreeze opens the freeze dialog when there is one (`onUnfreeze`), the limits and the
 * address list are changed in Wallet, which needs the owner's signature.
 */
export function ApprovalActions({
  mindId,
  next,
  sending,
  busy,
  small = false,
  onApprove,
  onDecline,
  onUnfreeze,
  onFund,
  className,
}: {
  mindId: string
  next: NextStep
  /** The answer on its way for this card: its button spins until the result replaces the card. */
  sending: "approve" | "decline" | null
  busy: boolean
  small?: boolean
  onApprove: () => void
  onDecline: () => void
  /** Opens the freeze dialog; without it, Unfreeze links to Wallet (a shared demo wallet). */
  onUnfreeze?: () => void
  /** Opens Add funds; without it, the button links to Wallet (a shared demo wallet). */
  onFund?: () => void
  className?: string
}) {
  const size = small ? "sm" : "default"
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button variant="outline" size={size} onClick={onDecline} disabled={busy}>
        {sending === "decline" && <Spinner />}
        {sending === "decline" ? "Declining" : "Decline"}
      </Button>
      {next === "approve" || sending === "approve" ? (
        <Button size={size} onClick={onApprove} disabled={busy} aria-live="polite">
          {sending === "approve" ? <Spinner /> : <CheckIcon />}
          {sending === "approve" ? "Sending" : "Approve"}
        </Button>
      ) : next === "unfreeze" && onUnfreeze ? (
        <Button size={size} onClick={onUnfreeze} disabled={busy}>
          <SnowflakeIcon />
          Unfreeze first
        </Button>
      ) : next === "fund" && onFund ? (
        <Button size={size} onClick={onFund} disabled={busy}>
          <PlusIcon />
          Add funds first
        </Button>
      ) : (
        // Approving would be refused before signing, so send the owner to fix it (a change that
        // needs their signature) instead of offering a button that can't work.
        <Button size={size} disabled={busy} nativeButton={false} render={<Link href={mindHref(mindId, "wallet")} />}>
          {next === "unfreeze" ? "Unfreeze first" : next === "add_address" ? "Add the address first" : next === "fund" ? "Add funds first" : "Change limits first"}
        </Button>
      )}
    </div>
  )
}

/** A payment's amount, large, and where it goes (Approvals, the Attack Playground). */
export function PaymentAmount({ amountNear, to, toClassName }: { amountNear: string; to: string; toClassName?: string }) {
  return (
    <>
      <p className="flex items-end gap-2">
        <span className="text-4xl leading-9 font-medium tracking-[-1.5px] text-foreground">{amountNear}</span>
        <span className="text-base font-medium text-muted-foreground">NEAR</span>
      </p>
      <span className={cn("max-w-full truncate rounded-sm px-3 font-mono text-[13px] text-foreground", toClassName)}>{to}</span>
    </>
  )
}

/** The arguments the owner is approving, as plain "Label value" rows (no code font, per the UI rules). */
export function ApprovalDetailLines({ details }: { details: ApprovalDetails }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dl className="flex flex-col gap-1">
        {details.lines.map((l) => (
          <div key={l.label} className="flex min-w-0 gap-2 text-[13px]">
            <dt className="w-14 shrink-0 text-muted-foreground">{l.label}</dt>
            <dd className="min-w-0 break-words text-foreground">{l.value}</dd>
          </div>
        ))}
      </dl>
      {details.note && <p className="text-xs text-muted-foreground">{details.note}</p>}
    </div>
  )
}
