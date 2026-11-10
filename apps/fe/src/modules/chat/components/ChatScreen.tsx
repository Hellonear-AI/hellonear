"use client"

import Link from "next/link"
import { cn } from "cn"
import { ArrowDownIcon, NetworkIcon, SnowflakeIcon } from "lucide-react"
import { Fragment, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { mindHref } from "@/components/layout/nav"
import { isApiCode } from "@/lib/api"
import { composerNote } from "@/modules/chat/data/intro"
import { useChatRun } from "@/modules/chat/hooks/ChatRunProvider"
import { useThread } from "@/modules/chat/hooks/useThread"
import { TRY_OUT_MESSAGES, useTryOutLeft } from "@/modules/chat/hooks/useTryOut"
import { useLeaveTryOut, useSession } from "@/modules/auth/hooks/useSession"
import { Composer } from "@/modules/chat/components/Composer"
import { templateLabel } from "@/modules/minds/data/minds"
import { useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"
import { LiveView } from "@/modules/graph/components/LiveView"
import { setLiveOpen, useLiveOpen } from "@/modules/graph/data/liveOpen"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { MEDIA, matches } from "@/lib/media"
import { pinGap, useChatScroll } from "@/modules/chat/hooks/useChatScroll"
import { dayLabel } from "@/modules/chat/data/thread"
import { Shown, TurnView } from "@/modules/chat/components/TurnView"
import { FirstChat, Centered, ThreadSkeleton } from "@/modules/chat/components/ChatStates"

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
    tryOut && (tryOutLeft === 0 || isApiCode(active?.failed, "demo_run_limit"))
  const limit = wallet?.policy?.perTransactionNear ?? null

  // The live view (C2, #17): beside the chat from 1280 px, remembered per device; a sheet below that.
  const liveOpen = useLiveOpen()
  const [liveSheet, setLiveSheet] = useState(false)
  // Phones get it as a drawer from the bottom (Ancung, 10 Nov), tablets as a sheet from the right.
  const [liveDrawer, setLiveDrawer] = useState(false)
  const [liveAnimate, setLiveAnimate] = useState(false)
  const toggleLive = () => {
    if (!matches(MEDIA.md)) return setLiveDrawer(true)
    if (!matches(MEDIA.xl)) return setLiveSheet(true)
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
  const notFound = isApiCode(thread.error, "thread_not_found")

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
