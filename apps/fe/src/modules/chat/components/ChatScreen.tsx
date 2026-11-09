"use client"

import Link from "next/link"
import { ArrowDownIcon, CircleXIcon, RotateCcwIcon, SnowflakeIcon } from "lucide-react"
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { mindHref } from "@/components/layout/nav"
import { ApiError } from "@/lib/api"
import { clockTime, shortWhen } from "@/lib/format"
import { paymentOf, type RunView, type ToolStep } from "@/modules/chat/data/events"
import { composerNote, introFor } from "@/modules/chat/data/intro"
import { useChatRun } from "@/modules/chat/hooks/ChatRunProvider"
import { useThread } from "@/modules/chat/hooks/useThread"
import { Composer } from "@/modules/chat/components/Composer"
import { ReplyText } from "@/modules/chat/components/ReplyText"
import { ApprovalCard, PaymentFailed, PaymentReceipt, PaymentRefused, ToolPill } from "@/modules/chat/components/RunCards"
import type { ApiWallet } from "@/modules/minds/api"
import { templateLabel } from "@/modules/minds/data/minds"
import { useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"

type Shown = { key: string; message: string | null; createdAt: string; view: RunView; live: boolean; failed: unknown }

/**
 * Chat (design 4 · Chat, C1): the thread, what each run did, and the composer. `threadId` null
 * is a new chat (C1.2). The run in progress lives in `ChatRunProvider`, so it survives the move
 * to `/chat/{threadId}`. The live view beside it (C2) comes next.
 */
export function ChatScreen({ mindId, threadId }: { mindId: string; threadId: string | null }) {
  const mind = useMind(mindId).data
  const wallet = useMindWallet(mindId).data ?? null
  const thread = useThread(mindId, threadId)
  const { active, send, resume } = useChatRun()

  const name = mind?.name ?? "Your Mind"
  const templateId = mind?.templateId ?? "general-assistant"
  const frozen = Boolean(wallet?.frozen)
  const limit = wallet?.policy?.perTransactionNear ?? null

  // The run in progress belongs here if it's this thread's, or a new chat still waiting for its id.
  const activeHere = active && (threadId ? active.threadId === threadId : active.threadId === null || active.streaming) ? active : null
  const activeRunId = activeHere ? (activeHere.resumeOf ?? activeHere.view.runId) : null
  const busy = Boolean(active?.streaming)

  const shown: Shown[] = thread.turns.map((t) =>
    activeHere && t.runId === activeRunId
      ? { key: t.runId, message: t.message, createdAt: t.createdAt, view: activeHere.view, live: activeHere.streaming, failed: activeHere.failed }
      : { key: t.runId, message: t.message, createdAt: t.createdAt, view: t.view, live: false, failed: null }
  )
  if (activeHere && !thread.turns.some((t) => t.runId === activeRunId)) {
    shown.push({
      key: `active-${activeHere.id}`,
      message: activeHere.message,
      createdAt: activeHere.view.at ?? new Date().toISOString(),
      view: activeHere.view,
      live: activeHere.streaming,
      failed: activeHere.failed,
    })
  }

  const isNew = !threadId && shown.length === 0
  const notFound = thread.error instanceof ApiError && thread.error.code === "thread_not_found"

  // A message sent here pins its turn to the top of the view while the reply grows below it.
  const last = shown.at(-1)
  const pinKey = activeHere?.message && last?.key && last.view === activeHere.view ? `pin-${activeHere.id}` : null
  const ready = !thread.isPending || !threadId || shown.length > 0
  const { ref: scrollRef, lastRef, onScroll, atBottom, toBottom, viewHeight } = useChatScroll(ready && shown.length > 0, pinKey)

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col md:h-dvh">
      <header className="hidden items-center gap-3 border-b border-border px-8 py-4 md:flex">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-[17px] font-semibold text-foreground">{name}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {templateLabel(templateId)}
            {limit ? ` · Asks before every payment, up to ${limit} NEAR each` : ""}
          </p>
        </div>
      </header>

      {frozen && (
        <div role="status" className="mx-4 mt-3 flex items-center gap-3 rounded-md bg-danger-soft px-4 py-2.5 text-sm text-foreground md:mx-8">
          <SnowflakeIcon className="size-4 shrink-0 text-danger" />
          <p className="min-w-0 flex-1">{name}&apos;s wallet is frozen. Nothing can be sent until you unfreeze it.</p>
          <Link href={mindHref(mindId, "wallet")} className="shrink-0 rounded-sm font-semibold text-danger outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus">
            Unfreeze
          </Link>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="relative h-full overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full w-full max-w-[804px] flex-col gap-5 px-4 py-6 md:px-10">
            {notFound ? (
              <Centered>
                <p className="text-sm text-muted-foreground">This chat isn&apos;t here any more.</p>
                <Button variant="outline" nativeButton={false} render={<Link href={mindHref(mindId, "chat")} />}>
                  Start a new chat
                </Button>
              </Centered>
            ) : thread.isError && shown.length === 0 ? (
              <Centered>
                <p className="text-sm text-muted-foreground">Couldn&apos;t load this chat. Check your connection and try again.</p>
                <Button variant="outline" onClick={() => void thread.refetch()}>
                  Try again
                </Button>
              </Centered>
            ) : thread.isPending && threadId && shown.length === 0 ? (
              <ThreadSkeleton />
            ) : isNew ? (
              <FirstChat
                name={name}
                templateId={templateId}
                limit={limit}
                disabled={busy || !mind}
                onPick={(text) => send(text, null)}
              />
            ) : (
              <>
                {thread.hasNextPage && (
                  <Button variant="ghost" size="sm" className="self-center" disabled={thread.isFetchingNextPage} onClick={() => void thread.fetchNextPage()}>
                    Show earlier messages
                  </Button>
                )}
                {shown.map((s, i) => (
                  <Fragment key={s.key}>
                    {dayLabel(s.createdAt, i > 0 ? shown[i - 1].createdAt : null) && (
                      <p className="text-xs font-medium text-muted-foreground">{dayLabel(s.createdAt, i > 0 ? shown[i - 1].createdAt : null)}</p>
                    )}
                    <div
                      ref={i === shown.length - 1 ? lastRef : undefined}
                      className="flex flex-col gap-5"
                      // Room below the pinned turn so it can sit at the top (padding 16 above, 24 below).
                      style={pinKey && i === shown.length - 1 && viewHeight ? { minHeight: viewHeight - 40 } : undefined}
                    >
                    <TurnView
                      mindId={mindId}
                      name={name}
                      templateId={templateId}
                      turn={s}
                      policy={wallet?.policy ?? null}
                      busy={busy}
                      onRetry={() => s.message && send(s.message, threadId ?? activeHere?.threadId ?? null)}
                      wallet={wallet}
                      onAnswer={(step, action) =>
                        s.view.runId &&
                        resume({ runId: s.view.runId, threadId: threadId ?? s.view.threadId, toolCallId: step.toolCallId, action, tool: step.tool, args: step.args })
                      }
                    />
                    </div>
                  </Fragment>
                ))}
              </>
            )}
          </div>
        </div>
        {!atBottom && (
          <Button
            size="sm"
            variant="secondary"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 cursor-pointer shadow-sm animate-in fade-in-0 duration-150 motion-reduce:animate-none"
            onClick={toBottom}
          >
            <ArrowDownIcon />
            Latest
          </Button>
        )}
      </div>

      <div className="mx-auto w-full max-w-[804px] px-4 pt-3 pb-4 md:px-10 md:pb-5">
        <Composer name={name} busy={busy} note={composerNote(name, frozen)} onSend={(text) => send(text, threadId)} />
      </div>
    </div>
  )
}

function TurnView({
  mindId,
  name,
  templateId,
  turn,
  policy,
  busy,
  onRetry,
  wallet,
  onAnswer,
}: {
  mindId: string
  name: string
  templateId: string
  turn: Shown
  policy: ApiWallet["policy"]
  busy: boolean
  onRetry: () => void
  wallet: ApiWallet | null
  onAnswer: (step: ToolStep, action: "approve" | "decline") => void
}) {
  const { view, live } = turn
  const failed = Boolean(turn.failed) || view.status === "error"
  const working = live && !view.text
  // While there's no text yet: "Thinking" while the model reasons. A running tool already has
  // its own shimmering pill above (C1.3), so only the dots show then.
  const activity = view.thinking ? "Thinking" : null
  const pills = view.tools.filter((t) => !paymentOf(t) || t.status === "ok" || t.status === "declined" || t.status === "running")

  return (
    <>
      {turn.message && (
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-[18px_18px_4px_18px] bg-primary px-4 py-2.5 text-[15px] leading-[22px] break-words whitespace-pre-wrap text-primary-foreground md:max-w-[75%]">
            {turn.message}
          </p>
        </div>
      )}

      {pills.map((step) => (
        <ToolPill key={step.toolCallId} step={step} />
      ))}

      {(view.text || working) && (
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center gap-2">
            <MindAvatar templateId={templateId} size={24} />
            <span className="text-[13px] font-semibold text-foreground">{name}</span>
          </div>
          {/* Plain text, no bubble (decided 9 Nov with Ancung, like Claude and Gemini). */}
          {view.text ? <ReplyText key={live ? "live" : "done"} text={view.text} live={live} /> : <Working activity={activity} name={name} />}
          {!live && view.text && (
            <div className="flex items-center gap-2">
              {view.verified && <VerifiedBadge level={view.verified} />}
              {view.at && <span className="text-xs text-muted-foreground">{clockTime(view.at)}</span>}
            </div>
          )}
        </div>
      )}

      {view.tools.map((step) => {
        const payment = paymentOf(step)
        if (step.status === "awaiting_approval" && view.status === "awaiting_approval" && !live) {
          return <ApprovalCard key={step.toolCallId} mindId={mindId} step={step} wallet={wallet} busy={busy} onAnswer={(action) => onAnswer(step, action)} />
        }
        if (!payment) return null
        if (step.status === "ok") return <PaymentReceipt key={step.toolCallId} payment={payment} policy={policy} />
        if (step.status === "policy_denied" || step.status === "wallet_frozen") {
          return <PaymentRefused key={step.toolCallId} step={step} payment={payment} policy={policy} mindName={name} />
        }
        if (step.status === "error") return <PaymentFailed key={step.toolCallId} payment={payment} />
        return null
      })}

      {failed && !live && <FailedReply name={name} error={turn.failed ?? view.error} canRetry={Boolean(turn.message) && !busy} onRetry={onRetry} />}
    </>
  )
}

/** The Mind is at work: typing dots, plus what it is doing when we know (design C1.3). */
function Working({ activity, name }: { activity: string | null; name: string }) {
  return (
    <span role="status" aria-label={activity ? `${name}: ${activity}` : `${name} is working`} className="flex h-[22px] items-center gap-2.5">
      <span aria-hidden className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="typing-dot size-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </span>
      {activity && (
        <span key={activity} aria-hidden className="text-shimmer text-sm font-medium animate-in fade-in-0 duration-150 ease-out">
          {activity}
        </span>
      )}
    </span>
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
      {canRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcwIcon />
          Try again
        </Button>
      )}
    </div>
  )
}

/**
 * A day label before a turn, only where it tells something: when the day changes inside the
 * thread, or at the top of a thread from another day. A chat from today has none.
 */
export function dayLabel(at: string, previous: string | null, now: Date = new Date()): string | null {
  const day = shortWhen(at, now)
  if (previous === null) return day === "Today" ? null : day
  return day === shortWhen(previous, now) ? null : day
}

export function failureText(name: string, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "demo_run_limit") return `That's all the messages this try-out has. Connect a wallet to keep chatting with ${name}.`
    if (error.code === "demo_rate_limited") return "Too many messages from this network right now. Wait a few minutes, then try again."
    if (error.status === 401) return "Your session ended. Sign in again to keep chatting."
    if (error.status >= 500) return `${name} couldn't answer. The AI service didn't respond, so nothing happened.`
    return `${name} couldn't answer. Nothing happened.`
  }
  // A string is a run.error from the stream: the message was stored before the run broke.
  if (typeof error === "string") return `${name} couldn't answer. The AI service stopped partway. Your message is saved and nothing else happened.`
  return `${name} couldn't answer. The connection dropped, so check yours and try again.`
}

function VerifiedBadge({ level }: { level: "gateway_tee" | "model_tee" }) {
  return (
    <Badge variant="verified" className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      {level === "model_tee" ? "Verified private (model TEE)" : "Verified via NEAR AI TEE gateway"}
    </Badge>
  )
}

/** C1.2: a brand new chat. The Mind introduces itself and offers three things to try. */
function FirstChat({
  name,
  templateId,
  limit,
  disabled,
  onPick,
}: {
  name: string
  templateId: string
  limit: string | null
  disabled: boolean
  onPick: (text: string) => void
}) {
  const { intro, suggestions } = introFor(templateId, limit, null)
  return (
    <Centered>
      <MindAvatar templateId={templateId} size={64} className="size-24! md:size-28!" />
      <h2 className="text-2xl font-medium tracking-tight text-foreground md:text-[28px]">Hi, I&apos;m {name}.</h2>
      <p className="max-w-md text-[15px] text-muted-foreground">{intro}</p>
      {suggestions.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          {suggestions.map((s) => (
            <Button key={s} variant="outline" size="sm" disabled={disabled} onClick={() => onPick(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}
    </Centered>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="m-auto flex flex-col items-center gap-3 py-10 text-center">{children}</div>
}

function ThreadSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <Skeleton className="ml-auto h-10 w-56 rounded-[18px]" />
      <Skeleton className="h-24 w-full max-w-[480px] rounded-[18px]" />
      <Skeleton className="ml-auto h-10 w-40 rounded-[18px]" />
      <Skeleton className="h-16 w-full max-w-[420px] rounded-[18px]" />
    </div>
  )
}

/**
 * Where the chat sits (Ancung, 9 Nov, like Claude): an old thread opens at its end; a message
 * sent here glides its turn to the top, and the reply grows below without the view chasing it.
 * "Latest" shows whenever there is more below.
 */
function useChatScroll(ready: boolean, pinKey: string | null) {
  const ref = useRef<HTMLDivElement>(null)
  const lastRef = useRef<HTMLDivElement>(null)
  const [viewHeight, setViewHeight] = useState(0)
  const [atBottom, setAtBottom] = useState(true)
  const placed = useRef<string | null>(null)

  const measure = useCallback(() => {
    const el = ref.current
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48)
  }, [])

  // The view's height (for the pinned turn's room) and content growth (for "Latest").
  useEffect(() => {
    const el = ref.current
    const content = el?.firstElementChild
    if (!el || !content) return
    const observer = new ResizeObserver(() => {
      setViewHeight(el.clientHeight)
      measure()
    })
    observer.observe(el)
    observer.observe(content)
    return () => observer.disconnect()
  }, [measure])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !ready || !viewHeight) return
    const want = pinKey ?? "end"
    if (placed.current === want) return
    const first = placed.current === null
    placed.current = want
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (pinKey && lastRef.current) {
      el.scrollTo({ top: lastRef.current.offsetTop - 16, behavior: first || reduce ? "auto" : "smooth" })
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [ready, pinKey, viewHeight])

  const toBottom = useCallback(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" })
  }, [])

  return { ref, lastRef, onScroll: measure, atBottom, toBottom, viewHeight }
}
