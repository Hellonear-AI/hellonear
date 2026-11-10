"use client"

import { useQuery } from "@tanstack/react-query"
import {
  CheckIcon,
  CircleSlashIcon,
  FlagIcon,
  HourglassIcon,
  MailIcon,
  MessageSquareWarningIcon,
  PuzzleIcon,
  ShieldCheckIcon,
  SwordsIcon,
  TriangleAlertIcon,
  UserRoundXIcon,
  WalletMinimalIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "cn"
import { Spinner } from "@/components/elements/Spinner"
import { PageTitle } from "@/components/elements/PageTitle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { explorerTxUrl, formatNear } from "@/lib/format"
import { attackApi, type ApiAttack } from "@/modules/attack/api"
import { attackCopy, KNOWN_ATTACKS, type AttackCopy } from "@/modules/attack/data/attacks"
import { attackOutcome, type Outcome } from "@/modules/attack/data/outcome"
import { StepRow } from "@/modules/chat/components/ReplySteps"
import { ReplyText } from "@/modules/chat/components/ReplyText"
import { Working } from "@/modules/chat/components/ChatScreen"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { refusalReasons } from "@/modules/chat/components/RunCards"
import { foldRun, type RunEvent } from "@/modules/chat/data/events"
import { mindsApi, type ApiWallet } from "@/modules/minds/api"
import { mindKeys } from "@/modules/minds/hooks/useMinds"

type Run = {
  attack: ApiAttack
  events: RunEvent[]
  streaming: boolean
  answered: "approve" | "decline" | null
  failed: boolean
}

const ICON: Record<AttackCopy["icon"], typeof MailIcon> = {
  message: MessageSquareWarningIcon,
  mail: MailIcon,
  skill: PuzzleIcon,
  owner: UserRoundXIcon,
}

/**
 * Attack Playground (design "8 · Attack Playground", X1.1 to X1.7, #16). Each attack runs on its own
 * playground Mind and the shared demo wallet, never on the owner's Minds or wallet (decided 9 Nov
 * with Ancung, as in docs/api-contract.md §2). The Mind may be fooled; the approval card is layer 1
 * and the wallet's limits in OutLayer's TEE are layer 2. The playground never approves for the owner.
 */
export function AttackScreen() {
  const list = useQuery({ queryKey: ["attacks"], queryFn: attackApi.list, staleTime: 5 * 60_000 })
  const ready = Array.isArray(list.data)
  const attacks = list.data ?? KNOWN_ATTACKS
  const [run, setRun] = useState<Run | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  // The demo wallet the playground Mind pays from, once a run says which Mind it is.
  const mindId = run?.events.find((e) => e.mindId)?.mindId ?? null
  const wallet = useQuery({
    queryKey: mindId ? mindKeys.wallet(mindId) : ["minds", "none", "wallet"],
    queryFn: () => mindsApi.wallet(mindId as string),
    enabled: Boolean(mindId),
  })

  async function follow(next: Run, go: (onEvent: (e: RunEvent) => void, signal: AbortSignal) => Promise<void>) {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setRun(next)
    const onEvent = (e: RunEvent) => setRun((r) => (r && r.attack.attackId === next.attack.attackId ? { ...r, events: [...r.events, e] } : r))
    let failed = false
    try {
      await go(onEvent, controller.signal)
    } catch {
      failed = !controller.signal.aborted
    }
    if (controller.signal.aborted) return
    setRun((r) => (r && r.attack.attackId === next.attack.attackId ? { ...r, streaming: false, failed } : r))
    // The balance shown afterwards is read again, so "balance still" is the wallet's word, not ours.
    void wallet.refetch()
  }

  function start(attack: ApiAttack) {
    void follow({ attack, events: [], streaming: true, answered: null, failed: false }, (onEvent, signal) =>
      attackApi.run(attack.attackId, onEvent, signal)
    )
  }

  function answer(action: "approve" | "decline") {
    if (!run) return
    const outcome = attackOutcome(run)
    const runId = run.events.find((e) => e.runId)?.runId
    if (outcome.kind !== "waiting" || !runId) return
    void follow({ ...run, streaming: true, answered: action, failed: false }, (onEvent, signal) =>
      attackApi.answer(runId, action, { toolCallId: outcome.step.toolCallId, attackId: run.attack.attackId }, onEvent, signal)
    )
  }

  const balance = wallet.data?.balanceNear

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 xl:p-8">
      <PageTitle
        title="Attack playground"
        description="Try to trick a Mind into paying a stranger. The wallet's limits should stop it every time."
        actions={
          balance !== undefined ? (
            <span className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-foreground">
              <WalletMinimalIcon className="size-3.5 text-muted-foreground" />
              Test wallet: {formatNear(balance)} NEAR
            </span>
          ) : undefined
        }
      />

      {list.data === null && (
        <div role="status" className="flex items-start gap-3 rounded-md bg-info-soft px-4 py-3 text-sm text-foreground">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-info" />
          <p>Running attacks needs a backend update that isn&apos;t live yet. You can read what each attack does in the meantime.</p>
        </div>
      )}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <section aria-labelledby="pick" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 xl:sticky xl:top-8 xl:w-[340px] xl:shrink-0">
          <h2 id="pick" className="text-[13px] text-muted-foreground">
            Pick an attack
          </h2>
          {list.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ul className="flex flex-col gap-2">
              {attacks.map((a) => {
                const copy = attackCopy(a)
                const mine = run?.attack.attackId === a.attackId ? run : null
                const outcome = mine ? attackOutcome(mine) : null
                const busy = Boolean(run?.streaming)
                const Icon = ICON[copy.icon]
                return (
                  <li key={a.attackId} className={cn("flex flex-col gap-2.5 rounded-md p-3", mine ? "bg-muted" : "bg-transparent")}>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{copy.title}</span>
                      {outcome && <OutcomeBadge outcome={outcome} />}
                    </div>
                    <p className="text-[13px] text-muted-foreground">{copy.line}</p>
                    <Button
                      size="sm"
                      variant={mine ? "outline" : "default"}
                      disabled={!ready || busy}
                      onClick={() => start(a)}
                      className="w-full"
                    >
                      {mine?.streaming && !mine.answered ? <Spinner /> : null}
                      {mine?.streaming && !mine.answered ? "Running" : mine ? "Run again" : "Run attack"}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {run ? (
            <RunPanel run={run} wallet={wallet.data ?? null} onAnswer={answer} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                <SwordsIcon className="size-5 text-muted-foreground" />
              </span>
              <p className="text-[15px] font-semibold text-foreground">Pick an attack to start</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Each one runs on testnet with a test Mind and a shared test wallet, never your own. Nothing you do here costs real money.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  switch (outcome.kind) {
    case "running":
    case "answering":
      return <Badge variant="neutral">Running</Badge>
    case "waiting":
      return (
        <Badge variant="warning">
          <HourglassIcon />
          Waiting
        </Badge>
      )
    case "declined":
      return <Badge variant="success">Declined</Badge>
    case "blocked":
      return <Badge variant="success">Blocked</Badge>
    case "refused":
      return <Badge variant="success">Refused</Badge>
    case "no_tool":
      return <Badge variant="success">Could not pay</Badge>
    case "sent":
      return <Badge variant="destructive">Paid</Badge>
    case "failed":
      return <Badge variant="neutral">Didn&apos;t run</Badge>
  }
}

function RunPanel({ run, wallet, onAnswer }: { run: Run; wallet: ApiWallet | null; onAnswer: (action: "approve" | "decline") => void }) {
  const outcome = attackOutcome(run)
  const view = foldRun(run.events)
  const copy = attackCopy(run.attack)
  const balance = wallet ? `${formatNear(wallet.balanceNear)} NEAR` : null

  // One conversation, like the chat (Ancung, 10 Nov): the attack as the message sent, the test
  // Mind's reply under its avatar, then the result card where the chat puts its cards.
  return (
    <section aria-labelledby="doing" className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="doing" className="text-[15px] font-semibold text-foreground">
          {copy.title}
        </h2>
        {run.streaming && (
          <Badge variant="neutral">
            <Spinner />
            Live
          </Badge>
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <span className="text-xs text-muted-foreground">Sent to the Mind</span>
        <p className="max-w-[85%] rounded-[18px_18px_4px_18px] bg-primary px-4 py-2.5 text-[15px] leading-[22px] break-words whitespace-pre-wrap text-primary-foreground">
          {run.attack.message}
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <MindAvatar templateId={run.attack.templateId} size={24} />
          <span className="text-[13px] font-semibold text-foreground">Test Mind</span>
        </div>
        {view.tools.length > 0 && (
          <div className="flex flex-col gap-1">
            {view.tools.map((t) => (
              <StepRow key={t.toolCallId} step={t} />
            ))}
          </div>
        )}
        {view.text && <ReplyText text={view.text} live={run.streaming} />}
        {run.streaming && !view.text && <Working name="Test Mind" />}
        {/* While it runs, the thinking dots and step rows say so; the card comes with the result. */}
        {outcome.kind !== "running" && (
          // Part of the reply, not a card of its own: the panel is already the card.
          <div aria-live="polite" className="flex flex-col gap-4 pt-3">

            <Result outcome={outcome} copy={copy} wallet={wallet} balance={balance} onAnswer={onAnswer} />
          </div>
        )}
      </div>
    </section>
  )
}

function Result({
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
            <p className="flex items-end gap-2">
              <span className="text-4xl leading-9 font-medium tracking-[-1.5px] text-foreground">{outcome.payment.amountNear}</span>
              <span className="text-base font-medium text-muted-foreground">NEAR</span>
            </p>
            <span className="w-fit max-w-full truncate rounded-sm bg-surface px-3 py-1.5 font-mono text-[13px] text-foreground">{outcome.payment.to}</span>
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
