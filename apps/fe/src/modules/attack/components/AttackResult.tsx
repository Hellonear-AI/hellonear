"use client"

import {
  CheckIcon,
  CircleSlashIcon,
  FlagIcon,
  HourglassIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { type ReactNode } from "react"
import { cn } from "cn"
import { Spinner } from "@/components/elements/Spinner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { explorerTxUrl } from "@/lib/format"
import { type AttackCopy } from "@/modules/attack/data/attacks"
import { type Outcome } from "@/modules/attack/data/outcome"
import { refusalReasons } from "@/modules/wallet/data/checks"
import { PaymentAmount } from "@/modules/wallet/components/ApprovalParts"
import { type ApiWallet } from "@/modules/wallet/api"

export function Result({
  outcome,
  copy,
  wallet,
  balance,
  onAnswer,
}: {
  outcome: Outcome
  copy: AttackCopy
  wallet: ApiWallet | null
  balance: string | null
  onAnswer: (action: "approve" | "decline") => void
}) {
  const foot = `Nothing was signed or sent.${balance ? ` The test wallet still has ${balance}.` : ""}`
  switch (outcome.kind) {
    case "running":
      return <Head icon={<Spinner />} title={`Running: ${copy.title.toLowerCase()}`} />
    case "answering":
      return (
        <Head
          icon={<Spinner />}
          title={outcome.action === "approve" ? "Approving anyway..." : "Declining..."}
          line={outcome.action === "approve" ? "The wallet checks your limits before signing anything." : undefined}
        />
      )
    case "waiting": {
      const reasons = wallet?.policy ? refusalReasons(outcome.payment, wallet.policy) : []
      return (
        <>
          <Head icon={<HourglassIcon />} tone="warning" title="The Mind asked you first." line="Every payment waits for you. This is one you never asked for." />
          <div className="flex flex-col gap-3 rounded-md bg-warning-soft p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-muted-foreground">It wants to send</span>
              <Badge variant="destructive">Suspicious</Badge>
            </div>
            <PaymentAmount amountNear={outcome.payment.amountNear} to={outcome.payment.to} toClassName="w-fit bg-surface py-1.5" />
            <p className="text-[13px] text-foreground">
              You never asked for this. It came from the attack{reasons.length ? `, and ${reasons.map((r) => r.toLowerCase()).join(" and ")}` : ""}.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => onAnswer("approve")}>
                Approve anyway
              </Button>
              <Button onClick={() => onAnswer("decline")}>
                <CircleSlashIcon />
                Decline
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Layer 1: you. Decline and nothing is sent. Layer 2: the wallet. Even if you approve anyway, its limits stop it before signing.
          </p>
        </>
      )
    }
    case "declined":
      return (
        <>
          <Head
            icon={<ShieldCheckIcon />}
            tone="success"
            title="Declined. No money moved."
            line={outcome.payment ? `The Mind was fooled and asked to send ${outcome.payment.amountNear} NEAR to ${outcome.payment.to}. You said no.` : "The Mind was fooled and asked to pay. You said no."}
          />
          <Layers stopper="you" />
          <Foot why="Every payment waits for you, so the wallet never had to step in." foot={foot} />
        </>
      )
    case "blocked": {
      const reasons = outcome.frozen ? ["The wallet is frozen"] : wallet?.policy && outcome.payment ? refusalReasons(outcome.payment, wallet.policy) : []
      return (
        <>
          <Head
            icon={<ShieldCheckIcon />}
            tone="success"
            title="Blocked by the wallet. No money moved."
            line={reasons.length ? `${reasons.join(". ")}.` : "The payment broke the wallet's limits."}
          />
          <Layers stopper="wallet" />
          <Foot
            why="The Mind was fooled and you approved, but the wallet wasn't. Its limits are stored on-chain, where the Mind can't change them, and enforced in a TEE before anything is signed."
            foot={foot}
          />
        </>
      )
    }
    case "refused":
      return (
        <>
          <Head icon={<FlagIcon />} tone="success" title="Refused. No money moved." line="The Mind saw it was a trick and did not ask to pay." />
          <Layers stopper="mind" />
          <Foot why="Had it asked, the payment would still wait for you, and the wallet would still check its limits." foot={foot} />
        </>
      )
    case "no_tool":
      return (
        <>
          <Head icon={<ShieldCheckIcon />} tone="success" title="Could not pay. No money moved." line="This Mind has no skill that can pay, so the request went nowhere." />
          <Layers stopper="skills" />
          <Foot why="A Mind can only do what its skills allow. Even with Payments, every payment waits for you." foot={foot} />
        </>
      )
    case "sent":
      return (
        <>
          <Head icon={<TriangleAlertIcon />} tone="danger" title="A payment went out." line="This attack got through. Here is the transaction." />
          <p className="text-sm text-foreground">
            {outcome.payment ? `${outcome.payment.amountNear} NEAR to ${outcome.payment.to}.` : "A payment was sent."}{" "}
            {outcome.txHash && (
              <a href={explorerTxUrl(outcome.txHash)} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                See it on NearBlocks
              </a>
            )}
          </p>
        </>
      )
    case "failed":
      return <Head icon={<TriangleAlertIcon />} title="The attack didn't run" line="Something went wrong. No payment was sent. Please try again later." />
  }
}

function Head({ icon, title, line, tone }: { icon: ReactNode; title: string; line?: string; tone?: "success" | "warning" | "danger" }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md [&>svg]:size-4",
          tone === "success" ? "bg-success-soft text-success" : tone === "warning" ? "bg-warning-soft text-warning" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground"
        )}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-lg font-semibold text-foreground">{title}</p>
        {line && <p className="text-[13px] text-muted-foreground">{line}</p>}
      </div>
    </div>
  )
}

/** The four things between an attack and the money, in the order a payment meets them. */
const LAYERS = [
  { id: "mind", label: "The Mind" },
  { id: "skills", label: "Its skills" },
  { id: "you", label: "Your approval" },
  { id: "wallet", label: "Wallet limits" },
] as const

/**
 * One row of the layers, the one that stopped the attack in green (Ancung, 10 Nov: the boxes in a
 * card read as a report). Layers after it say "Not needed"; the ones before carry no claim, since
 * a run doesn't always prove what they did.
 */
function Layers({ stopper }: { stopper: (typeof LAYERS)[number]["id"] }) {
  const at = LAYERS.findIndex((l) => l.id === stopper)
  return (
    // A track of dots joined by a line, not boxes (Ancung, 10 Nov: boxes in a card in a card).
    <ol aria-label="What stood between the attack and the money" className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
      {LAYERS.map((l, i) => {
        const stopped = i === at
        const after = i > at
        return (
          <li key={l.id} aria-current={stopped ? "step" : undefined} className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  stopped ? "bg-success" : after ? "border border-dashed border-border-strong" : "bg-border-strong"
                )}
              >
                {stopped && <CheckIcon className="size-3 text-background" strokeWidth={3} />}
              </span>
              {i < LAYERS.length - 1 && <span aria-hidden className={cn("hidden h-px flex-1 sm:block", after || stopped ? "border-t border-dashed border-border-strong" : "bg-border-strong")} />}
            </span>
            <span className={cn("text-[13px] font-medium", stopped ? "text-foreground" : "text-muted-foreground")}>{l.label}</span>
            <span className={cn("-mt-1 text-xs", stopped ? "text-success" : "text-tertiary-foreground")}>{stopped ? "Stopped it" : after ? "Not needed" : "\u00a0"}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Foot({ why, foot }: { why: string; foot: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[13px] text-muted-foreground">{why}</p>
      <p className="text-xs text-tertiary-foreground">{foot}</p>
    </div>
  )
}
