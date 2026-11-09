"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  CheckIcon,
  CircleSlashIcon,
  InboxIcon,
  Loader2Icon,
  SnowflakeIcon,
  XIcon,
} from "lucide-react"
import { useState } from "react"
import { CountBadge } from "@/components/elements/CountBadge"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { PageTitle } from "@/components/elements/PageTitle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { mindHref } from "@/components/layout/nav"
import { formatNear, shortWhen, timeAgo } from "@/lib/format"
import { TryOutLockedDialog, useTryOutLock } from "@/modules/auth/components/TryOutLockedDialog"
import { useSession } from "@/modules/auth/hooks/useSession"
import { chatApi } from "@/modules/chat/api"
import { paymentOf, toolLabel, type ToolStep } from "@/modules/chat/data/events"
import { answerLost } from "@/modules/chat/data/answer"
import { useChatRun } from "@/modules/chat/hooks/ChatRunProvider"
import { ApprovalDetailLines } from "@/modules/chat/components/RunCards"
import { approvalDetails } from "@/modules/chat/data/approvalDetails"
import type { ApiApproval, ApiPayment, ApiWallet } from "@/modules/minds/api"
import { useApprovals, useMind, useMindWallet, usePayments } from "@/modules/minds/hooks/useMinds"
import { approvalChecks } from "@/modules/wallet/data/checks"
import { FreezeDialog } from "@/modules/wallet/components/FreezeDialog"

/**
 * Approvals (design "5 · Money", A1): every payment the Mind wants to make waits here with what
 * you asked and three plain checks; nothing is sent until you approve. Approve and Decline
 * resume the paused run through `ChatRunProvider` (no wallet signature: OutLayer checks the
 * limits in its TEE and signs). Beside it: the emergency stop (W3) and recent payments.
 */
export function ApprovalsScreen({ mindId }: { mindId: string }) {
  const mind = useMind(mindId).data
  const wallet = useMindWallet(mindId).data ?? null
  const approvals = useApprovals(mindId)
  const demo = Boolean(useSession().data?.demo)
  const { active, resume } = useChatRun()
  const [freezeOpen, setFreezeOpen] = useState(false)
  // A fresh dialog per opening: it reads freeze or unfreeze once, when it opens.
  const [freezeKey, setFreezeKey] = useState(0)
  const openFreeze = () => {
    setFreezeKey((k) => k + 1)
    setFreezeOpen(true)
  }
  // A try-out sees Freeze too, and it says why it needs a wallet (T1.4).
  const locked = useTryOutLock()

  const name = mind?.name ?? "Your Mind"
  const templateId = mind?.templateId ?? "general-assistant"
  // The answer in progress (from ChatRunProvider, so the chat's card agrees): its card says
  // "Sending" and the others wait their turn (A1.2). Once through, it leaves the list; if it
  // never arrived, it stays to be tried again. Progress and result are a toast from the provider.
  const answer = active?.answer ?? null
  const sending = Boolean(answer && active?.streaming)
  const done = Boolean(answer && active && !active.streaming && !answerLost(active.failed))
  const waiting = (approvals.data ?? []).filter((a) => !(done && a.toolCallId === answer?.toolCallId))
  const empty = !approvals.isPending && !approvals.isError && waiting.length === 0

  function respond(approval: ApiApproval, action: "approve" | "decline") {
    resume({ runId: approval.runId, threadId: approval.threadId, toolCallId: approval.toolCallId, action, tool: approval.tool, args: approval.args })
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 xl:p-8">
      <PageTitle title="Approvals" description={`Every payment ${name} wants to make. Nothing is sent until you say yes.`} />

      {/* Empty: the card stretches to the side column so both end on one line; with cards, each keeps its height. */}
      <div className={`flex flex-col gap-6 xl:flex-row ${empty ? "xl:items-stretch" : "xl:items-start"}`}>
        <section aria-labelledby="waiting" className="flex min-w-0 flex-1 flex-col gap-4">
          {/* The heading only helps when there is something under it; empty says so itself (A1.4). */}
          <div className={waiting.length > 0 ? "flex items-center gap-2" : "sr-only"}>
            <h2 id="waiting" className="text-[15px] font-semibold text-foreground">
              Waiting for you
            </h2>
            <CountBadge count={waiting.length} />
          </div>

          {approvals.isPending ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : approvals.isError ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-5">
              <p className="text-sm text-muted-foreground">Couldn&apos;t load the approvals. Check your connection and try again.</p>
              <Button variant="outline" onClick={() => void approvals.refetch()}>
                Try again
              </Button>
            </div>
          ) : waiting.length === 0 ? (
            <NothingWaiting mindId={mindId} name={name} />
          ) : (
            waiting.map((a) => (
              <ApprovalCard
                key={a.toolCallId}
                mindId={mindId}
                name={name}
                templateId={templateId}
                approval={a}
                wallet={wallet}
                // One answer at a time: the others wait their turn (A1.2).
                state={sending ? (answer?.toolCallId === a.toolCallId ? "sending" : "waiting") : "idle"}
                onApprove={() => respond(a, "approve")}
                onDecline={() => respond(a, "decline")}
                onUnfreeze={openFreeze}
              />
            ))
          )}
        </section>

        <aside className="flex flex-col gap-6 xl:w-[380px] xl:shrink-0">
          <EmergencyStop name={name} wallet={wallet} onOpen={demo ? () => locked.lock("freeze") : wallet?.shared ? null : openFreeze} />
          <RecentDecisions mindId={mindId} />
        </aside>
      </div>

      <TryOutLockedDialog action={locked.action} name={name} onClose={locked.close} />
      <FreezeDialog key={freezeKey} mindId={mindId} name={name} freeze={!wallet?.frozen} open={freezeOpen} onOpenChange={setFreezeOpen} />
    </div>
  )
}

type CardState = "idle" | "sending" | "waiting"

function ApprovalCard({
  mindId,
  name,
  templateId,
  approval,
  wallet,
  state,
  onApprove,
  onDecline,
  onUnfreeze,
}: {
  mindId: string
  name: string
  templateId: string
  approval: ApiApproval
  wallet: ApiWallet | null
  state: CardState
  onApprove: () => void
  onDecline: () => void
  onUnfreeze: () => void
}) {
  const step: ToolStep = { toolCallId: approval.toolCallId, tool: approval.tool, status: "awaiting_approval", args: approval.args, result: undefined }
  const payment = paymentOf(step)
  const details = payment ? null : approvalDetails(step)
  const { checks, next } = payment ? approvalChecks(payment, wallet) : { checks: [], next: "approve" as const }
  const asked = useAsked(mindId, approval)
  const busy = state !== "idle"

  return (
    <article
      aria-busy={state === "sending" || undefined}
      className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-5 transition-opacity duration-200 ease-out data-[waiting=true]:opacity-60"
      data-waiting={state === "waiting"}
    >
      <div className="flex items-center gap-2.5">
        <MindAvatar templateId={templateId} size={24} className="size-7!" />
        <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">{payment ? `${name} wants to send` : `${name} wants to go ahead`}</p>
        <span className="shrink-0 text-xs text-muted-foreground">Asked {timeAgo(approval.requestedAt)}</span>
      </div>

      {payment ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-end gap-2">
            <span className="text-4xl leading-9 font-medium tracking-[-1.5px] text-foreground">{payment.amountNear}</span>
            <span className="text-base font-medium text-muted-foreground">NEAR</span>
          </p>
          <span className="max-w-full truncate rounded-sm bg-muted px-3 py-2 font-mono text-[13px] text-foreground">{payment.to}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-foreground">{details?.title ?? toolLabel(approval.tool)}</p>
          {details && <ApprovalDetailLines details={details} />}
        </div>
      )}

      {asked && <p className="rounded-md bg-muted px-3 py-2.5 text-[13px] leading-5 text-muted-foreground">You asked: &ldquo;{asked}&rdquo;</p>}

      {checks.length > 0 && (
        <ul className="flex flex-col gap-2">
          {checks.map((c) => (
            <li key={c.text} className="flex items-center gap-2 text-[13px] text-foreground">
              {c.ok ? <CheckIcon className="size-4 shrink-0 text-success" /> : <XIcon className="size-4 shrink-0 text-danger" />}
              {c.text}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onDecline}>
          Decline
        </Button>
        {next === "approve" || state === "sending" ? (
          <Button disabled={busy} onClick={onApprove}>
            {state === "sending" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <CheckIcon />}
            {state === "sending" ? "Sending" : "Approve"}
          </Button>
        ) : next === "unfreeze" ? (
          <Button disabled={busy} onClick={onUnfreeze}>
            <SnowflakeIcon />
            Unfreeze first
          </Button>
        ) : (
          // Approving would be refused before signing, so send the owner to fix the limit
          // (a change that needs their signature) instead of offering a button that can't work.
          <Button disabled={busy} nativeButton={false} render={<Link href={mindHref(mindId, "wallet")} />}>
            {next === "add_address" ? "Add the address first" : "Change limits first"}
          </Button>
        )}
      </div>
    </article>
  )
}

/** The user's own message that led to this request, as the reason (the payment tool carries none). */
function useAsked(mindId: string, approval: ApiApproval): string | null {
  const { data } = useQuery({
    queryKey: ["runs", approval.runId, "asked"],
    queryFn: async () => {
      const { messages } = await chatApi.messages(mindId, approval.threadId)
      return messages.find((m) => m.runId === approval.runId && m.role === "user")?.text ?? null
    },
    staleTime: Infinity,
  })
  return data ?? null
}

/** A1.4: empty is good news. Says when things show up and keeps the limits close. */
function NothingWaiting({ mindId, name }: { mindId: string; name: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <InboxIcon className="size-5 text-muted-foreground" />
      </span>
      <p className="text-[15px] font-semibold text-foreground">Nothing waiting for you</p>
      <p className="max-w-sm text-sm text-muted-foreground">When {name} wants to pay someone, it shows up here first.</p>
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={mindHref(mindId, "wallet")} />}>
        Change limits
      </Button>
    </div>
  )
}

function EmergencyStop({ name, wallet, onOpen }: { name: string; wallet: ApiWallet | null; onOpen: (() => void) | null }) {
  if (!wallet) return null
  const frozen = wallet.frozen
  return (
    <section aria-labelledby="emergency-stop" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-[9px] bg-danger-soft">
          <SnowflakeIcon className="size-4 text-danger" />
        </span>
        <h2 id="emergency-stop" className="text-[15px] font-semibold text-foreground">
          {frozen ? "Wallet frozen" : "Emergency stop"}
        </h2>
      </div>
      <p className="text-[13px] leading-5 text-muted-foreground">
        {frozen
          ? `Nothing can leave ${name}'s wallet until you unfreeze it. Waiting requests stay here.`
          : `Freezing stops every payment from ${name} right away, including the skills. Waiting requests stay here.`}
      </p>
      {/* A try-out's button opens T1.4; a shared wallet that isn't a try-out has nothing to offer. */}
      {onOpen && (
        <Button variant={frozen ? "outline" : "destructive"} className="w-fit" onClick={onOpen}>
          <SnowflakeIcon />
          {frozen ? `Unfreeze ${name}'s wallet` : `Freeze ${name}'s wallet`}
        </Button>
      )}
    </section>
  )
}

const PAYMENT_LINE: Record<ApiPayment["status"], { note: string; badge: string; variant: "success" | "destructive" | "warning" | "neutral" }> = {
  sent: { note: "You approved", badge: "Sent", variant: "success" },
  policy_denied: { note: "Stopped by your limits", badge: "Blocked", variant: "destructive" },
  wallet_frozen: { note: "Wallet was frozen", badge: "Blocked", variant: "destructive" },
  failed: { note: "Didn't go through", badge: "Failed", variant: "neutral" },
  pending: { note: "On its way", badge: "Sending", variant: "warning" },
}

function RecentDecisions({ mindId }: { mindId: string }) {
  const { data: payments, isPending, isError } = usePayments(mindId)
  return (
    <section aria-labelledby="recent-decisions" className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-5">
      <h2 id="recent-decisions" className="text-[15px] font-semibold text-foreground">
        Recent payments
      </h2>
      {isPending ? (
        <Skeleton className="mt-2 h-24 w-full" />
      ) : isError ? (
        <p className="py-3 text-[13px] text-muted-foreground">Couldn&apos;t load the payments.</p>
      ) : !payments?.length ? (
        <p className="py-3 text-[13px] text-muted-foreground">No payments yet.</p>
      ) : (
        <ul className="flex flex-col">
          {payments.map((p) => {
            const line = PAYMENT_LINE[p.status]
            const sent = p.status === "sent"
            return (
              <li key={p.paymentId} className="flex items-start gap-3 py-3">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${sent ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                  {sent ? <CheckIcon className="size-4" /> : <CircleSlashIcon className="size-4" />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-sm font-medium text-foreground">
                    {formatNear(p.amountNear)} NEAR to {p.to}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {shortWhen(p.at)}, {line.note.toLowerCase()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`text-sm font-semibold ${sent ? "text-foreground" : "text-muted-foreground"}`}>
                    {sent ? "−" : ""}
                    {formatNear(p.amountNear)} NEAR
                  </span>
                  <Badge variant={line.variant}>{line.badge}</Badge>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
