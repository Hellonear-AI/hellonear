"use client"

import { useState } from "react"
import {
  ArrowUpRightIcon,
  CheckIcon,
  CircleSlashIcon,
  HourglassIcon,
  SnowflakeIcon,
  XIcon,
} from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { explorerTxUrl } from "@/lib/format"
import { approvalDetails } from "@/modules/runs/data/approvalDetails"
import { paymentOf, type Payment, type ToolStep } from "@/modules/runs/data/events"
import { toolLabel } from "@/modules/runs/data/steps"
import type { ApiWallet } from "@/modules/wallet/api"
import { FreezeDialog } from "@/modules/wallet/components/FreezeDialog"
import { ApprovalActions, ApprovalCheckList, ApprovalDetailLines } from "@/modules/wallet/components/ApprovalParts"
import { AddFundsDialog } from "@/modules/wallet/components/AddFundsDialog"
import { approvalChecks, NOT_LISTED, refusalReasons } from "@/modules/wallet/data/checks"

// What a run did, in the chat (design C1.1, C1.3, C1.4, C1.7): a pill per tool, a receipt for a
// payment, a red card when the wallet refused one, and an approval card while it waits.
// Wording: policy is stored on-chain and enforced in a TEE; a refused payment never shows a tx link.

type Policy = ApiWallet["policy"]

/** A payment that went out: amount, who, which limit allowed it, and the transaction. */
export function PaymentReceipt({ payment, policy, byRule }: { payment: Payment; policy: Policy; byRule?: boolean }) {
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
      {byRule && <p className="text-xs text-muted-foreground">Approved by your rule, without asking you (Settings)</p>}
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
 * refuse it; otherwise the button leads to the fix. There is no Approvals page since 11 Nov: Recent
 * chats marks the chats that wait, and a toast says so when the owner is in another chat.
 */
export function ApprovalCard({
  mindId,
  name,
  step,
  wallet,
  busy,
  sending,
  onAnswer,
}: {
  mindId: string
  name: string
  step: ToolStep
  wallet: ApiWallet | null
  busy: boolean
  /** The answer on its way, if this card's: its button spins until the result replaces the card. */
  sending: "approve" | "decline" | null
  onAnswer: (action: "approve" | "decline") => void
}) {
  const payment = paymentOf(step)
  const details = payment ? null : approvalDetails(step)
  // Unfreeze opens the freeze dialog right here.
  const [unfreeze, setUnfreeze] = useState({ open: false, key: 0 })
  const [funds, setFunds] = useState({ open: false, key: 0 })
  const { checks, next } = payment ? approvalChecks(payment, wallet) : { checks: [], next: "approve" as const }
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg bg-warning-soft p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none md:max-w-[480px]">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold break-words text-foreground">
          {payment ? `${payment.amountNear} NEAR to ${payment.to}` : (details?.title ?? toolLabel(step.tool))}
        </p>
        <Badge variant="warning">
          <HourglassIcon />
          Waiting for you
        </Badge>
      </div>
      {details && <ApprovalDetailLines details={details} />}
      <ApprovalCheckList checks={checks} />
      <ApprovalActions
        small
        mindId={mindId}
        next={next}
        sending={sending}
        busy={busy}
        onApprove={() => onAnswer("approve")}
        onDecline={() => onAnswer("decline")}
        onUnfreeze={wallet?.shared ? undefined : () => setUnfreeze((u) => ({ open: true, key: u.key + 1 }))}
        onFund={wallet && !wallet.shared ? () => setFunds((f) => ({ open: true, key: f.key + 1 })) : undefined}
      />
      {wallet && funds.key > 0 && (
        <AddFundsDialog key={funds.key} mindId={mindId} name={name} wallet={wallet} open={funds.open} onOpenChange={(open) => setFunds((f) => ({ ...f, open }))} />
      )}
      {unfreeze.key > 0 && <FreezeDialog key={unfreeze.key} mindId={mindId} name={name} freeze={false} open={unfreeze.open} onOpenChange={(open) => setUnfreeze((u) => ({ ...u, open }))} />}
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


