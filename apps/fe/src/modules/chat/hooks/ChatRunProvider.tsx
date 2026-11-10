"use client"

import { useQueryClient } from "@tanstack/react-query"
import { usePathname, useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { mindHref } from "@/components/layout/nav"
import { ArrowUpRightIcon } from "lucide-react"
import { toast } from "sonner"
import { explorerTxUrl } from "@/lib/format"
import { chatApi } from "@/modules/chat/api"
import { answerOutcome, type Answer, type Outcome } from "@/modules/chat/data/answer"
import { foldRun, type RunEvent, type RunView } from "@/modules/chat/data/events"
import { chatKeys } from "@/modules/chat/hooks/useThread"
import { mindKeys } from "@/modules/minds/hooks/useMinds"

/** The run on screen right now: a message being answered, or a run resumed after an approval. */
export type ActiveRun = {
  id: number
  threadId: string | null
  /** The user's message; null when an approval resumed an earlier run. */
  message: string | null
  /** The run that was resumed, so the thread shows the new events in its place. */
  resumeOf: string | null
  /** The approval being answered, so its card can say "Sending" wherever it is shown. */
  answer: Answer | null
  /** The turn holds the top of the view: sent from here, or an answer to a turn that was. */
  pinned: boolean
  /** Started from a new chat (`/chat`), before the thread had an id. */
  newThread: boolean
  events: RunEvent[]
  view: RunView
  streaming: boolean
  /** The request failed before or during the stream (network, 4xx/5xx). */
  failed: unknown
}

type ChatRun = {
  active: ActiveRun | null
  send: (message: string, threadId: string | null) => void
  /** Approve or decline a paused run. Progress and result show as one toast, on any screen. */
  resume: (answer: Answer & { threadId: string | null }) => void
  /** Stop the reply in progress (#121). The backend ends its stream with run.finished "canceled". */
  stop: () => void
}

const ChatRunContext = createContext<ChatRun | null>(null)

/**
 * One chat run at a time per Mind, shared by the chat, the live view and the Approvals badge
 * (apps/fe/CLAUDE.md). It lives in the Mind layout so the stream survives the move from
 * `/chat` to `/chat/{threadId}` when a new thread gets its id.
 */
export function ChatRunProvider({ mindId, children }: { mindId: string; children: ReactNode }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const [active, setActive] = useState<ActiveRun | null>(null)
  const nextId = useRef(1)
  const pathRef = useRef(pathname)
  useEffect(() => {
    pathRef.current = pathname
  }, [pathname])

  const run = useCallback(
    async (
      start: Omit<ActiveRun, "id" | "events" | "view" | "streaming" | "failed">,
      open: (onEvent: (e: RunEvent) => void) => Promise<void>,
      /** Events already known (a resumed run's earlier ones), so the turn never empties for a moment. */
      known: RunEvent[] = []
    ): Promise<{ view: RunView; failed: unknown }> => {
      const id = nextId.current++
      const events: RunEvent[] = [...known]
      let failed: unknown = null
      let threadId = start.threadId
      const update = (patch: Partial<ActiveRun>) =>
        setActive((cur) => (cur?.id === id ? { ...cur, ...patch, events: [...events], view: foldRun(events) } : cur))
      setActive({ ...start, id, events: [...events], view: foldRun(events), streaming: true, failed: null })

      try {
        await open((e) => {
          events.push(e)
          if (!threadId && e.type === "run.started" && e.threadId) {
            threadId = e.threadId
            // A new thread got its id: give it its own URL (the layout, and this run, stay mounted).
            const chatPath = mindHref(mindId, "chat")
            if (pathRef.current === chatPath) router.replace(`${chatPath}/${threadId}`)
            void queryClient.invalidateQueries({ queryKey: mindKeys.recentChats(mindId) })
          }
          update({ threadId })
        })
        update({ streaming: false, threadId })
      } catch (err) {
        failed = err
        update({ streaming: false, failed: err, threadId })
      }

      // Read the stored thread back; once it holds this run, the thread shows it from there.
      await Promise.all([
        threadId ? queryClient.invalidateQueries({ queryKey: chatKeys.thread(mindId, threadId) }) : null,
        queryClient.invalidateQueries({ queryKey: mindKeys.recentChats(mindId) }),
        queryClient.invalidateQueries({ queryKey: mindKeys.approvals(mindId) }),
        queryClient.invalidateQueries({ queryKey: mindKeys.all }),
      ])
      return { view: foldRun(events), failed }
    },
    [mindId, queryClient, router]
  )

  const value = useMemo<Omit<ChatRun, "stop">>(
    () => ({
      active,
      send: (message, threadId) =>
        void run({ threadId, message, resumeOf: null, answer: null, pinned: true, newThread: threadId === null }, (onEvent) =>
          chatApi.send(mindId, threadId ? { message, threadId } : { message }, onEvent)
        ),
      resume: ({ threadId, ...answer }) => {
        const { runId, toolCallId, action } = answer
        const toastId = `answer-${toolCallId}`
        showOutcome(toastId, answerOutcome(answer, { view: foldRun([]), streaming: true, failed: null }))
        // The resumed stream only carries new events. Start from the ones already on screen (this
        // run in progress, or the thread's cache) so the turn doesn't empty and jump the view (Ancung).
        const same = active?.view.runId === runId ? active : null
        const known = same?.events ?? queryClient.getQueryData<RunEvent[]>(chatKeys.run(runId)) ?? []
        const pinned = Boolean(same?.pinned)
        void run(
          { threadId, message: null, resumeOf: runId, answer, pinned, newThread: false },
          async (onEvent) => {
            if (known.length === 0) (await queryClient.fetchQuery({ queryKey: chatKeys.run(runId), queryFn: () => chatApi.runEvents(runId) })).forEach(onEvent)
            await chatApi.resume(runId, action, { toolCallId }, onEvent)
            await queryClient.invalidateQueries({ queryKey: chatKeys.run(runId) })
          },
          known
        ).then((end) => showOutcome(toastId, answerOutcome(answer, { ...end, streaming: false })))
      },
    }),
    [active, mindId, queryClient, run]
  )
  const stop = useCallback(() => {
    const runId = active?.streaming ? (active.view.runId ?? active.events.find((e) => e.runId)?.runId) : null
    if (!runId) return
    // 409 not_running: it ended on its own first; nothing to tell the owner.
    chatApi.cancel(runId).catch((err) => {
      if (!(err instanceof Error && "status" in err && (err as { status: number }).status === 409)) toast.error("Could not stop the reply", { description: "Please try again." })
    })
  }, [active])
  const withStop = useMemo(() => ({ ...value, stop }), [value, stop])

  return <ChatRunContext.Provider value={withStop}>{children}</ChatRunContext.Provider>
}

/** One toast per answer (Ancung, 9 Nov): "Sending …", then sent with a NearBlocks button, or why not. */
function showOutcome(id: string, outcome: Outcome) {
  const opts = {
    id,
    description: outcome.detail,
    action: outcome.txHash
      ? { label: <ExternalLabel>NearBlocks</ExternalLabel>, onClick: () => window.open(explorerTxUrl(outcome.txHash!), "_blank", "noopener,noreferrer") }
      : undefined,
  }
  if (outcome.kind === "sending") toast.loading(outcome.title, opts)
  else if (outcome.kind === "sent") toast.success(outcome.title, { ...opts, duration: 10_000 })
  else if (outcome.kind === "declined") toast(outcome.title, opts)
  else toast.error(outcome.title, { ...opts, duration: 10_000 })
}

// A drawn arrow, not "↗": Windows renders that character as a blue emoji (Ancung, 9 Nov).
function ExternalLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      {children}
      <ArrowUpRightIcon className="size-3.5" />
    </span>
  )
}

/** The run in progress, or null, also outside a Mind's layout (the sidebar uses it for its dot). */
export function useActiveRun(): ActiveRun | null {
  return useContext(ChatRunContext)?.active ?? null
}

export function useChatRun(): ChatRun {
  const ctx = useContext(ChatRunContext)
  if (!ctx) throw new Error("useChatRun needs a ChatRunProvider (the Mind layout)")
  return ctx
}
