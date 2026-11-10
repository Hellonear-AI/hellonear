"use client"

import Link from "next/link"
import { ThinkingOrb } from "thinking-orbs"
import { cn } from "cn"
import { ArrowDownIcon, CircleXIcon, NetworkIcon, RotateCcwIcon, SnowflakeIcon } from "lucide-react"
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { CopyButton } from "@/components/elements/CopyButton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { mindHref } from "@/components/layout/nav"
import { ApiError } from "@/lib/api"
import { clockTime, shortWhen } from "@/lib/format"
import { paymentOf, type ReplyPart, type RunView, type ToolStep } from "@/modules/chat/data/events"
import { composerNote, introFor } from "@/modules/chat/data/intro"
import { useChatRun } from "@/modules/chat/hooks/ChatRunProvider"
import { useThread } from "@/modules/chat/hooks/useThread"
import { TRY_OUT_MESSAGES, useTryOutLeft } from "@/modules/chat/hooks/useTryOut"
import { useLeaveTryOut, useSession } from "@/modules/auth/hooks/useSession"
import { Composer } from "@/modules/chat/components/Composer"
import { ReplyText } from "@/modules/chat/components/ReplyText"
import { ApprovalCard, PaymentFailed, PaymentReceipt, PaymentRefused } from "@/modules/chat/components/RunCards"
import { Elapsed, StepRow, StepsSummary, ThoughtRow } from "@/modules/chat/components/ReplySteps"
import { summaryLabel } from "@/modules/chat/data/steps"
import type { ApiWallet } from "@/modules/minds/api"
import { templateLabel } from "@/modules/minds/data/minds"
import { useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"
import { LiveView } from "@/modules/graph/components/LiveView"
import { setLiveOpen, useLiveOpen } from "@/modules/graph/data/liveOpen"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"

/** `read`: the run's events are in, so an empty reply is known to be empty, not still loading. */
type Shown = { key: string; message: string | null; createdAt: string; view: RunView; live: boolean; failed: unknown; read: boolean }

/**
 * Chat (design 4 · Chat, C1): the thread, what each run did, and the composer. `threadId` null
 * is a new chat (C1.2). The run in progress lives in `ChatRunProvider`, so it survives the move
 * to `/chat/{threadId}`. The live view beside it (C2) comes next.
 */
export function ChatScreen({ mindId, threadId }: { mindId: string; threadId: string | null }) {
  const mind = useMind(mindId).data
  const wallet = useMindWallet(mindId).data ?? null
  const session = useSession()
  const thread = useThread(mindId, threadId)
  const { active, send, resume, stop, stopping } = useChatRun()

  const name = mind?.name ?? "Your Mind"
  const templateId = mind?.templateId ?? "general-assistant"
  const frozen = Boolean(wallet?.frozen)
  // Try-out (T1.3 to T1.5): the shared test wallet, a message count, and a way to a real wallet.
  const tryOut = Boolean(session.data?.demo)
  const tryOutLeft = useTryOutLeft()
  const leaveTryOut = useLeaveTryOut()
  const outOfMessages =
    tryOut && (tryOutLeft === 0 || (active?.failed instanceof ApiError && active.failed.code === "demo_run_limit"))
  const limit = wallet?.policy?.perTransactionNear ?? null

  // The live view (C2, #17): beside the chat from 1280 px, remembered per device; a sheet below that.
  const liveOpen = useLiveOpen()
  const [liveSheet, setLiveSheet] = useState(false)
  // Phones get it as a drawer from the bottom (Ancung, 10 Nov), tablets as a sheet from the right.
  const [liveDrawer, setLiveDrawer] = useState(false)
  const [liveAnimate, setLiveAnimate] = useState(false)
  const toggleLive = () => {
    if (!window.matchMedia("(min-width: 768px)").matches) return setLiveDrawer(true)
    if (!window.matchMedia("(min-width: 1280px)").matches) return setLiveSheet(true)
    setLiveAnimate(true)
    setLiveOpen(!liveOpen)
  }

  // The run in progress belongs here if it's this thread's, or a new chat still waiting for its id.
  // On a new chat (`/chat`), the run started from this page stays on it until the move to
  // `/chat/{threadId}` lands. Before, it only stayed while streaming, so a reply that finished
  // before that move (slow in dev) dropped the page back to the empty "Hi, I'm …" for a moment
  // (Ancung, 9 Nov). A run from before this page opened (a later "New chat") isn't shown.
  const [openedAfter] = useState(() => active?.id ?? 0)
  const activeHere =
    active && (threadId ? active.threadId === threadId : active.newThread && active.id > openedAfter) ? active : null
  const activeRunId = activeHere ? (activeHere.resumeOf ?? activeHere.view.runId) : null
  const busy = Boolean(active?.streaming)

  // The run in progress keeps one key, `active-{id}`, whether it comes from the stream or from a
  // refetched thread (window focus refetches it mid-stream). A key change remounted the turn and
  // replayed its entrance, so the sent message and first thought seemed to appear twice (Ancung).
  const shown: Shown[] = thread.turns.map((t) =>
    activeHere && t.runId === activeRunId
      ? { key: `active-${activeHere.id}`, message: t.message, createdAt: t.createdAt, view: activeHere.view, live: activeHere.streaming, failed: activeHere.failed, read: true }
      : { key: t.runId, message: t.message, createdAt: t.createdAt, view: t.view, live: false, failed: null, read: t.read }
  )
  if (activeHere && !thread.turns.some((t) => t.runId === activeRunId)) {
    shown.push({
      key: `active-${activeHere.id}`,
      message: activeHere.message,
      createdAt: activeHere.view.at ?? new Date().toISOString(),
      view: activeHere.view,
      live: activeHere.streaming,
      failed: activeHere.failed,
      read: true,
    })
  }

  const isNew = !threadId && shown.length === 0
  const notFound = thread.error instanceof ApiError && thread.error.code === "thread_not_found"

  // A message sent here pins its turn to the top of the view while the reply grows below it.
  const last = shown.at(-1)
  // The last turn keeps room below it while it's the one sent from here (also while answering
  // its approval), and the view glides it to the top only when a message is sent.
  const pinned = Boolean(activeHere?.pinned && last && last.view === activeHere.view)
  const pinKey = pinned && activeHere?.message ? `send-${activeHere.id}` : null
  const ready = !thread.isPending || !threadId || shown.length > 0
  const { ref: scrollRef, lastRef, onScroll, atBottom, toBottom, viewHeight } = useChatScroll(ready && shown.length > 0, pinKey)
  // The floating composer's height, so the content and "Latest" keep clear of it.
  const composerRef = useRef<HTMLDivElement>(null)
  const [composerHeight, setComposerHeight] = useState(120)
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setComposerHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 md:h-dvh">
    <div className="flex min-w-0 flex-1 flex-col">
      {/* No divider: the chat fades out under the header instead (Ancung, 9 Nov). */}
      <header className="hidden items-center gap-3 px-8 py-4 md:flex">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-[17px] font-semibold text-foreground">{name}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {templateLabel(templateId)}
            {tryOut ? ", try-out with a shared test wallet" : limit ? `, asks before every payment, up to ${limit} NEAR each` : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={toggleLive} aria-pressed={liveOpen} className="shrink-0 text-muted-foreground">
          <NetworkIcon />
          Live view
        </Button>
      </header>

      {tryOut && (
        <div role="status" className="mx-4 mt-3 flex flex-col gap-2 rounded-md bg-brand-soft px-4 py-2.5 text-sm text-foreground sm:flex-row sm:items-center md:mx-8">
          <p className="min-w-0 flex-1">
            Try-out{tryOutLeft !== null ? `: ${tryOutLeft} of ${TRY_OUT_MESSAGES} messages left` : ""}. Payments come from a shared test wallet
            {limit ? `, up to ${limit} NEAR each,` : ""} to approved addresses only.
          </p>
          <Button size="sm" variant="outline" className="w-fit shrink-0" onClick={leaveTryOut}>
            Connect a wallet
          </Button>
        </div>
      )}

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
        {/* Phones have no chat header, so the live view opens from here (Ancung, 10 Nov). */}
        <Button
          variant="outline"
          size="icon"
          aria-label="Live view"
          onClick={() => setLiveDrawer(true)}
          className="absolute top-2 right-3 z-10 bg-surface/90 shadow-xs backdrop-blur-sm md:hidden"
        >
          <NetworkIcon />
        </Button>
        {/* The scroll area runs to the bottom of the screen and the composer floats over it, so the
            scrollbar reaches the bottom like Claude's (Ancung, 10 Nov). The text still fades under the
            header and into the composer (Ancung, 9 Nov, like Gemini), now with overlays in the page
            colour instead of a mask, which hid the scrollbar's ends too. They stop short of the
            scrollbar. The content keeps room at the end for the composer. */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="relative h-full overflow-y-auto overscroll-contain"
        >
          <div
            className="mx-auto flex min-h-full w-full max-w-[804px] flex-col gap-5 px-4 pt-6 md:px-10"
            style={{ paddingBottom: composerHeight + 32 }}
          >
            {notFound ? (
              <Centered>
                <p className="text-sm text-muted-foreground">This chat is no longer available.</p>
                <Button variant="outline" nativeButton={false} render={<Link href={mindHref(mindId, "chat")} />}>
                  Start a new chat
                </Button>
              </Centered>
            ) : thread.isError && shown.length === 0 ? (
              <Centered>
                <p className="text-sm text-muted-foreground">Could not load this chat. Check your connection and try again.</p>
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
                      // Room below the pinned turn so it can sit at the top (16 above it, 48 of padding below).
                      style={pinned && i === shown.length - 1 && viewHeight ? { minHeight: viewHeight - composerHeight - 32 - pinGap() } : undefined}
                    >
                    <TurnView
                      last={i === shown.length - 1}
                      mindId={mindId}
                      name={name}
                      templateId={templateId}
                      turn={s}
                      policy={wallet?.policy ?? null}
                      busy={busy}
                      onRetry={() => s.message && send(s.message, threadId ?? activeHere?.threadId ?? null)}
                      wallet={wallet}
                      answering={activeHere?.answer ?? null}
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
        <div aria-hidden className="pointer-events-none absolute top-0 right-4 left-0 h-6 bg-gradient-to-b from-background to-transparent" />
        {!atBottom && (
          <Button
            size="sm"
            variant="secondary"
            className="absolute left-1/2 z-10 -translate-x-1/2 cursor-pointer shadow-sm animate-in fade-in-0 duration-150 motion-reduce:animate-none"
            style={{ bottom: composerHeight + 12 }}
            onClick={toBottom}
          >
            <ArrowDownIcon />
            Latest
          </Button>
        )}
        {/* The composer, floating at the bottom over a fade into the page colour. */}
        <div
          ref={composerRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 pt-12"
        >
          {/* The fade stops short of the scrollbar; the composer itself stays centred. */}
          <div aria-hidden className="absolute inset-y-0 right-4 left-0 bg-gradient-to-t from-background from-60% to-transparent" />
          <div className="pointer-events-auto relative mx-auto w-full max-w-[804px] px-4 pb-4 md:px-10 md:pb-5">
            {outOfMessages && (
              // T1.5: one clear way forward once the try-out's messages are used up.
              <div className="mb-3 flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4">
                <p className="text-[15px] font-semibold text-foreground">That&apos;s the end of the try-out</p>
                <p className="text-sm text-muted-foreground">
                  You&apos;ve used all {TRY_OUT_MESSAGES} messages. Connect a wallet to keep going with your own Mind, wallet and limits. This try-out is deleted after 7 days.
                </p>
                <Button size="sm" onClick={leaveTryOut}>
                  Connect Meteor
                </Button>
              </div>
            )}
            <Composer
              name={name}
              busy={busy}
              note={outOfMessages ? "Connect a wallet to send more messages." : tryOut ? `Try-out payments: ${limit ? `up to ${limit} NEAR, ` : ""}approved addresses only.` : composerNote(name, frozen)}
              locked={outOfMessages ? "Try-out finished" : undefined}
              onSend={(text) => send(text, threadId)}
              onStop={stop}
              stopping={stopping}
              draftKey={`hellonear.draft.${mindId}.${threadId ?? "new"}`}
            />
          </div>
        </div>
      </div>
    </div>
      {/* Opens and closes like the app's sidebar (Ancung, 10 Nov): the width slides 0 <-> 360 px
          (ease-in-out, 200 ms) and the panel fades, while the chat narrows or widens with it.
          No slide on the first paint, only after a click. */}
      <aside
        aria-hidden={!liveOpen}
        className={cn(
          "relative hidden shrink-0 overflow-hidden xl:block",
          liveOpen ? "w-[360px]" : "w-0",
          liveAnimate && "transition-[width] duration-200 ease-in-out motion-reduce:transition-none"
        )}
      >
        <div
          inert={!liveOpen}
          className={cn(
            "absolute inset-y-0 left-0 flex w-[360px] border-l border-border transition-opacity duration-150 ease-out motion-reduce:transition-none",
            liveOpen ? "opacity-100 delay-50" : "opacity-0"
          )}
        >
          <LiveView mindId={mindId} className="w-full p-5" />
        </div>
      </aside>
      <Drawer open={liveDrawer} onOpenChange={setLiveDrawer} showSwipeHandle>
        <DrawerContent style={{ ["--drawer-height" as string]: "85dvh" }} className="md:hidden">
          <DrawerTitle className="sr-only">Live view</DrawerTitle>
          {liveDrawer && <LiveView mindId={mindId} className="min-h-0 flex-1 px-4 pt-2 pb-4" />}
        </DrawerContent>
      </Drawer>
      <Sheet open={liveSheet} onOpenChange={setLiveSheet}>
        <SheetContent side="right" className="w-full p-5 pt-12 sm:max-w-[400px]!">
          <SheetTitle className="sr-only">Live view</SheetTitle>
          {liveSheet && <LiveView mindId={mindId} className="h-full" />}
        </SheetContent>
      </Sheet>
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
    if (step.status === "ok") return <PaymentReceipt payment={payment} policy={policy} />
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
              {view.verified && <VerifiedBadge level={view.verified} />}
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

/**
 * The Mind is at work and nothing else shows it yet (design C1.3): typing dots and "Thinking..."
 * from the moment the message is sent until the first text, thought or step (Ancung, 9 Nov: one
 * word for the whole wait; "Sending" read like money moving in a payments app).
 */
export function Working({ name }: { name: string }) {
  return (
    <span role="status" aria-label={`${name} is thinking`} className="flex h-[22px] items-center gap-2">
      {/* A thinking orb (thinking-orbs, Axel's pick, 10 Nov) instead of three dots. It follows the
          dark class, freezes with reduced motion and pauses off screen by itself. */}
      <ThinkingOrb state="solving" size={20} aria-hidden className="shrink-0" />
      <span aria-hidden className="text-shimmer text-[13px]">
        Thinking...
      </span>
      <Elapsed />
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
    if (error.code === "demo_rate_limited") return "Too many messages from this network. Please try again in a few minutes."
    if (error.status === 401) return "Your session ended. Sign in again to keep chatting."
    if (error.status >= 500) return `${name} could not answer. The AI service didn't respond, so nothing happened.`
    return `${name} could not answer. Nothing happened.`
  }
  if (error === "no_reply") return `${name} thought about it but didn't write a reply. Try asking again.`
  // A string is a run.error from the stream: the message was stored before the run broke.
  if (typeof error === "string") return `${name} could not answer. The AI service stopped partway. Your message is saved and nothing else happened.`
  return `${name} could not answer. The connection dropped, so check yours and try again.`
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
      <MindAvatar templateId={templateId} size={64} shown={112} className="size-24! md:size-28!" />
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
/**
 * Room above a pinned message: past the top fade, and on phones past the round Live view button
 * too (Ancung, 10 Nov). The last turn's min-height leaves the same room, so scrolling to the very
 * end puts the message where pinning put it, not under the fade. Read in the browser only.
 */
function pinGap(): number {
  return window.matchMedia("(min-width: 768px)").matches ? 24 : 60
}

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
    // Opening: go to the end (or to the turn just sent). After that, move only for a new message;
    // an approval, a resume or new text never moves the view (Ancung, 9 Nov).
    const first = placed.current === null
    if (!first && (!pinKey || placed.current === pinKey)) return
    const want = pinKey ?? "end"
    placed.current = want
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (pinKey && lastRef.current) {
      el.scrollTo({ top: lastRef.current.offsetTop - pinGap(), behavior: first || reduce ? "auto" : "smooth" })
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
