"use client"

import { CircleXIcon, ExternalLinkIcon, RotateCcwIcon } from "lucide-react"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { CopyButton } from "@/components/elements/CopyButton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { STATUS_URL } from "@/lib/config"
import { clockTime } from "@/lib/format"
import { paymentOf, type ReplyPart, type RunView, type ToolStep } from "@/modules/runs/data/events"
import { ReplyText } from "@/modules/runs/components/ReplyText"
import { VerifiedBadge } from "@/modules/runs/components/VerifiedBadge"
import { ApprovalCard, PaymentFailed, PaymentReceipt, PaymentRefused } from "@/modules/chat/components/RunCards"
import { StepRow, StepsSummary, ThoughtRow } from "@/modules/runs/components/ReplySteps"
import { summaryLabel } from "@/modules/runs/data/steps"
import { Working } from "@/modules/runs/components/Working"
import type { ApiWallet } from "@/modules/wallet/api"
import { failureText, mayBeOutage } from "@/modules/chat/data/thread"

/** `read`: the run's events are in, so an empty reply is known to be empty, not still loading. */
export type Shown = { key: string; message: string | null; createdAt: string; view: RunView; live: boolean; failed: unknown; read: boolean }

export function TurnView({
  mindId,
  name,
  templateId,
  turn,
  policy,
  busy,
  onRetry,
  wallet,
  answering,
  onAnswer,
  last = false,
}: {
  /** The newest turn: only it offers Retry, like Claude's regenerate on the last reply. */
  last?: boolean
  mindId: string
  name: string
  templateId: string
  turn: Shown
  policy: ApiWallet["policy"]
  busy: boolean
  onRetry: () => void
  wallet: ApiWallet | null
  /** The approval being answered right now, if any. */
  answering: { toolCallId: string; action: "approve" | "decline" } | null
  onAnswer: (step: ToolStep, action: "approve" | "decline") => void
}) {
  const { view, live } = turn
  const failed = Boolean(turn.failed) || view.status === "error"
  // Stored replies read before their events arrive have text but no parts yet.
  const parts: ReplyPart[] = view.parts.length > 0 ? view.parts : view.text ? [{ kind: "text", text: view.text }] : []
  const lastText = parts.findLastIndex((p) => p.kind === "text")
  // Dots only while nothing else shows progress: before anything arrives, or after a finished
  // tool until the next text. Reasoning and running tools have their own shimmering rows.
  const lastPart = parts.at(-1)
  const lastStep = lastPart?.kind === "tool" ? view.tools.find((t) => t.toolCallId === lastPart.toolCallId) : undefined
  const working = live && (!lastPart || (lastPart.kind === "tool" && lastStep?.status !== "running" && lastStep?.status !== "awaiting_approval"))
  const byCall = new Map(view.tools.map((t) => [t.toolCallId, t]))

  // Steps and thoughts are rows; approvals, receipts and refusals are cards that stay in place.
  const isRow = (step: ToolStep) =>
    step.status !== "awaiting_approval" && (!paymentOf(step) || step.status === "running" || step.status === "declined" || step.status === "stopped")
  const rowPart = (part: ReplyPart) => part.kind === "thought" || (part.kind === "tool" && Boolean(byCall.get(part.toolCallId) && isRow(byCall.get(part.toolCallId)!)))
  // Once the reply is done, its rows fold into one line above it (Ancung, 9 Nov, like Claude).
  const folded = !live && parts.some(rowPart)
  const foldLabel = folded
    ? summaryLabel(parts.filter((p) => p.kind === "tool" && rowPart(p)).length, view.workMs)
    : ""

  function rowNode(part: ReplyPart, i: number) {
    if (part.kind === "thought") return <ThoughtRow key={`r${i}`} text={part.text} from={part.from} to={part.to} live={live && i === parts.length - 1} />
    if (part.kind === "tool") {
      const step = byCall.get(part.toolCallId)
      return step ? <StepRow key={part.toolCallId} step={step} /> : null
    }
    return null
  }

  function toolPart(step: ToolStep) {
    const payment = paymentOf(step)
    // Waiting, or being answered right now (then it says "Sending" until the result replaces it).
    const answeringThis = answering?.toolCallId === step.toolCallId && live
    if (step.status === "awaiting_approval") {
      if ((view.status === "awaiting_approval" && !live) || answeringThis) {
        return (
          <ApprovalCard
            mindId={mindId}
            name={name}
            step={step}
            wallet={wallet}
            busy={busy}
            sending={answeringThis ? answering.action : null}
            onAnswer={(action) => onAnswer(step, action)}
          />
        )
      }
      return null
    }
    if (!payment || step.status === "running" || step.status === "declined" || step.status === "stopped") return <StepRow step={step} />
    if (step.status === "ok") return <PaymentReceipt payment={payment} policy={policy} byRule={step.approvedByRule} />
    if (step.status === "policy_denied" || step.status === "wallet_frozen") {
      return <PaymentRefused step={step} payment={payment} policy={policy} mindName={name} />
    }
    return <PaymentFailed payment={payment} />
  }

  return (
    <>
      {turn.message && (
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-[18px_18px_4px_18px] bg-primary px-4 py-2.5 text-[15px] leading-[22px] break-words whitespace-pre-wrap text-primary-foreground md:max-w-[75%]">
            {turn.message}
          </p>
        </div>
      )}

      {(parts.length > 0 || working) && (
        // The Mind's whole reply under one avatar, in the order it happened: what it said, the
        // card it needed (approval, then the receipt), and what it said after (Ancung, 9 Nov).
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center gap-2">
            <MindAvatar templateId={templateId} size={24} />
            <span className="text-[13px] font-semibold text-foreground">{name}</span>
          </div>
          {folded && <StepsSummary label={foldLabel}>{parts.map((p, i) => (rowPart(p) ? rowNode(p, i) : null))}</StepsSummary>}
          {parts.map((part, i) => {
            if (folded && rowPart(part)) return null
            if (part.kind === "thought") return rowNode(part, i)
            if (part.kind === "text") {
              // Plain text, no bubble (decided 9 Nov with Ancung, like Claude and Gemini).
              // A stable key: text already shown stays as it is when the run goes on (an approval),
              // and only what arrives after it is revealed (Ancung, 9 Nov: it re-typed on Approve).
              return <ReplyText key={`t${i}`} text={part.text} live={live && i === lastText} />
            }
            const step = byCall.get(part.toolCallId)
            const node = step ? toolPart(step) : null
            return node ? (
              <div key={part.toolCallId} className="flex">
                {node}
              </div>
            ) : null
          })}
          {working && <Working name={name} />}
          {!live && view.text && (
            <div className="flex flex-wrap items-center gap-2">
              {view.verified && <VerifiedBadge level={view.verified} proof={view.proof} runId={view.runId} />}
              {view.at && <span className="text-xs text-muted-foreground">{clockTime(view.at)}</span>}
              {/* Actions under a finished reply, like Claude (Ancung, 10 Nov). */}
              <span className="flex items-center gap-0.5">
                <CopyButton text={view.text} label="Copy reply" />
                {/* Retry sends the same message again as a new turn; the backend has no "replace this
                    reply" yet, so the old one stays above it. */}
                {last && turn.message && !busy && (
                  <button
                    type="button"
                    onClick={onRetry}
                    aria-label="Ask again"
                    title="Ask again"
                    className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus [&_svg]:size-4"
                  >
                    <RotateCcwIcon />
                  </button>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stopped with Stop (#121): what it said so far stays, and this says why it ends there. */}
      {!live && view.status === "canceled" && <p className="text-[13px] text-muted-foreground">You stopped this reply.</p>}

      {/* The run ended with nothing to show: say so instead of leaving a bare "Thought for" (Ancung, 9 Nov). */}
      {/* Only once the run's events are read: a stopped reply has no text either, and flashed this
          card while its events were still loading (Ancung, 10 Nov). */}
      {!failed && !live && turn.read && view.status === "finished" && !view.text.trim() && view.tools.length === 0 && (
        <FailedReply name={name} error="no_reply" canRetry={Boolean(turn.message) && !busy} onRetry={onRetry} />
      )}

      {failed && !live && <FailedReply name={name} error={turn.failed ?? view.error} canRetry={Boolean(turn.message) && !busy} onRetry={onRetry} />}
    </>
  )
}

/** C1.6: the reply didn't come. Says whether anything was kept, and offers one retry. */
function FailedReply({ name, error, canRetry, onRetry }: { name: string; error: unknown; canRetry: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="flex w-full flex-col items-start gap-3 rounded-lg bg-danger-soft p-4 md:max-w-[480px]">
      <p className="flex items-start gap-2.5 text-sm text-foreground">
        <CircleXIcon className="mt-0.5 size-4 shrink-0 text-danger" />
        {failureText(name, error)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcwIcon />
            Try again
          </Button>
        )}
        {/* #304: when a service may be down, say where to check it. A new tab, so the chat stays. */}
        {mayBeOutage(error) && (
          <Button variant="ghost" size="sm" nativeButton={false} render={<a href={STATUS_URL} target="_blank" rel="noopener noreferrer" />}>
            Check the status
            <ExternalLinkIcon />
          </Button>
        )}
      </div>
    </div>
  )
}

