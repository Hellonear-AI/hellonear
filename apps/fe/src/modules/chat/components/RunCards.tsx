"use client"

import Link from "next/link"
import {
  ArrowUpRightIcon,
  CheckIcon,
  CircleSlashIcon,
  HourglassIcon,
  Loader2Icon,
  SnowflakeIcon,
  XIcon,
} from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { mindHref } from "@/components/layout/nav"
import { explorerTxUrl } from "@/lib/format"
import { compareNear } from "@/lib/near"
import { paymentOf, toolLabel, type Payment, type ToolStep } from "@/modules/chat/data/events"
import type { ApiWallet } from "@/modules/minds/api"
import { approvalChecks } from "@/modules/wallet/data/checks"

// What a run did, in the chat (design C1.1, C1.3, C1.4, C1.7): a pill per tool, a receipt for a
// payment, a red card when the wallet refused one, and an approval card while it waits.
// Wording: policy is stored on-chain and enforced in a TEE; a refused payment never shows a tx link.

type Policy = ApiWallet["policy"]

/** A small line for a tool: what it is doing, or what it did. */
export function ToolPill({ step }: { step: ToolStep }) {
  const payment = paymentOf(step)
  const running = step.status === "running"
  let text = toolLabel(step.tool)
  if (payment && step.status === "ok") text = `You approved · Paid ${payment.to}`
  if (payment && step.status === "declined") text = `You declined · ${payment.amountNear} NEAR to ${payment.to}`

  return (
    <div className="flex w-fit max-w-full items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground animate-in fade-in-0 duration-150 ease-out motion-reduce:animate-none">
      {running ? (
        <Loader2Icon className="size-3.5 shrink-0 animate-spin motion-reduce:animate-[hn-fade-pulse_1.6s_ease_infinite]" />
      ) : step.status === "declined" ? (
        <XIcon className="size-3.5 shrink-0" />
      ) : (
        <CheckIcon className="size-3.5 shrink-0" />
      )}
      <span className={cn("truncate", running && "text-shimmer")}>{text}</span>
    </div>
  )
}

/** A payment that went out: amount, who, which limit allowed it, and the transaction. */
export function PaymentReceipt({ payment, policy }: { payment: Payment; policy: Policy }) {
  return (
    <div className="flex w-full flex-col gap-2.5 rounded-lg border border-border bg-surface p-4 md:max-w-[480px]">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-[15px] font-semibold break-words text-foreground">
          {payment.amountNear} NEAR to {payment.to}
        </p>
        <Badge variant="success">
          <CheckIcon />
          Sent
        </Badge>
      </div>
      <To account={payment.to} />
      {policy?.perTransactionNear && (
        <p className="text-xs text-muted-foreground">Allowed by: up to {policy.perTransactionNear} NEAR per payment</p>
      )}
      {payment.txHash && (
        <a
          href={explorerTxUrl(payment.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 rounded-sm text-[13px] font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
        >
          See the payment on NEAR Explorer
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      )}
    </div>
  )
}

/** The wallet refused before signing (C1.4) or is frozen (C1.5). Nothing was sent, so no tx link. */
export function PaymentRefused({ step, payment, policy, mindName }: { step: ToolStep; payment: Payment; policy: Policy; mindName: string }) {
  const frozen = step.status === "wallet_frozen"
  const reasons = frozen ? [] : refusalReasons(payment, policy)
  return (
    <div className="flex w-full flex-col gap-2.5 rounded-lg bg-danger-soft p-4 md:max-w-[480px]">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-[15px] font-semibold break-words text-foreground">{payment.amountNear} NEAR, not sent</p>
        <Badge variant="destructive">
          {frozen ? <SnowflakeIcon /> : <CircleSlashIcon />}
          {frozen ? "Frozen" : "Blocked"}
        </Badge>
      </div>
      <To account={payment.to} />
      {frozen ? (
        <p className="text-[13px] text-foreground">The wallet is frozen, so it stopped before signing. Nothing left your wallet.</p>
      ) : reasons.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-[13px] text-foreground">
          {reasons.map((r) => (
            <li key={r} className="flex items-center gap-2">
              <XIcon className="size-3.5 shrink-0 text-danger" />
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-foreground">Your limits stopped it before signing. Nothing left your wallet.</p>
      )}
      {!frozen && reasons.includes(NOT_LISTED) && (
        <p className="text-xs text-muted-foreground">
          If you know this address, add it in Wallet first. {mindName} can&apos;t add it for you.
        </p>
      )}
    </div>
  )
}

/** A payment that failed for another reason (not the policy). */
export function PaymentFailed({ payment }: { payment: Payment }) {
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-4 md:max-w-[480px]">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-[15px] font-semibold break-words text-foreground">{payment.amountNear} NEAR, not sent</p>
        <Badge variant="neutral">Didn&apos;t go through</Badge>
      </div>
      <To account={payment.to} />
    </div>
  )
}

/**
 * Waiting for the owner (C1.1). Answered right here (Ancung, 9 Nov; the design sent "Review and
 * approve" to Approvals): the same checks as Approvals (A1), and Approve only when nothing would
 * refuse it; otherwise the button leads to the fix. Approvals still lists every request.
 */
export function ApprovalCard({
  mindId,
  step,
  wallet,
  busy,
  onAnswer,
}: {
  mindId: string
  step: ToolStep
  wallet: ApiWallet | null
  busy: boolean
  onAnswer: (action: "approve" | "decline") => void
}) {
  const payment = paymentOf(step)
  const { checks, next } = payment ? approvalChecks(payment, wallet) : { checks: [], next: "approve" as const }
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg bg-warning-soft p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none md:max-w-[480px]">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold break-words text-foreground">
          {payment ? `${payment.amountNear} NEAR to ${payment.to}` : toolLabel(step.tool)}
        </p>
        <Badge variant="warning">
          <HourglassIcon />
          Waiting for you
        </Badge>
      </div>
      {checks.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {checks.map((c) => (
            <li key={c.text} className="flex items-center gap-2 text-[13px] text-foreground">
              {c.ok ? <CheckIcon className="size-3.5 shrink-0 text-success" /> : <XIcon className="size-3.5 shrink-0 text-danger" />}
              {c.text}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onAnswer("decline")} disabled={busy}>
          Decline
        </Button>
        {next === "approve" ? (
          <Button size="sm" onClick={() => onAnswer("approve")} disabled={busy}>
            <CheckIcon />
            Approve
          </Button>
        ) : (
          <Button size="sm" nativeButton={false} render={<Link href={mindHref(mindId, next === "unfreeze" ? "approvals" : "wallet")} />}>
            {next === "unfreeze" ? "Unfreeze first" : next === "add_address" ? "Add the address first" : "Change limits first"}
          </Button>
        )}
      </div>
    </div>
  )
}

function To({ account }: { account: string }) {
  return (
    <p className="flex min-w-0 items-center gap-2">
      <span className="text-xs text-muted-foreground">To</span>
      <span className={cn("min-w-0 truncate font-mono text-[13px] text-foreground")}>{account}</span>
    </p>
  )
}

const NOT_LISTED = "Not on your list of addresses"

/** Which of the owner's limits a refused payment broke, read against the wallet's stored policy. */
export function refusalReasons(payment: Payment, policy: Policy): string[] {
  const reasons: string[] = []
  if (policy?.whitelist && !policy.whitelist.includes(payment.to.toLowerCase())) reasons.push(NOT_LISTED)
  if (policy?.perTransactionNear && compareNear(payment.amountNear, policy.perTransactionNear) === 1) {
    reasons.push(`Over ${policy.perTransactionNear} NEAR per payment`)
  }
  return reasons
}
