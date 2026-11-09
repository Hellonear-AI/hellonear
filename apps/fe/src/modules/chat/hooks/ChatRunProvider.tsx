"use client"

import { useQueryClient } from "@tanstack/react-query"
import { usePathname, useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { mindHref } from "@/components/layout/nav"
import { chatApi } from "@/modules/chat/api"
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
  events: RunEvent[]
  view: RunView
  streaming: boolean
  /** The request failed before or during the stream (network, 4xx/5xx). */
  failed: unknown
}

type ChatRun = {
  active: ActiveRun | null
  send: (message: string, threadId: string | null) => void
  resume: (input: { runId: string; threadId: string | null; toolCallId: string; action: "approve" | "decline" }) => void
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
    async (start: Omit<ActiveRun, "id" | "events" | "view" | "streaming" | "failed">, open: (onEvent: (e: RunEvent) => void) => Promise<void>) => {
      const id = nextId.current++
      const events: RunEvent[] = []
      let threadId = start.threadId
      const update = (patch: Partial<ActiveRun>) =>
        setActive((cur) => (cur?.id === id ? { ...cur, ...patch, events: [...events], view: foldRun(events) } : cur))
      setActive({ ...start, id, events: [], view: foldRun([]), streaming: true, failed: null })

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
        update({ streaming: false, failed: err, threadId })
      }

      // Read the stored thread back; once it holds this run, the thread shows it from there.
      await Promise.all([
        threadId ? queryClient.invalidateQueries({ queryKey: chatKeys.thread(mindId, threadId) }) : null,
        queryClient.invalidateQueries({ queryKey: mindKeys.recentChats(mindId) }),
        queryClient.invalidateQueries({ queryKey: mindKeys.approvals(mindId) }),
        queryClient.invalidateQueries({ queryKey: mindKeys.all }),
      ])
    },
    [mindId, queryClient, router]
  )

  const value = useMemo<ChatRun>(
    () => ({
      active,
      send: (message, threadId) =>
        void run({ threadId, message, resumeOf: null }, (onEvent) =>
          chatApi.send(mindId, threadId ? { message, threadId } : { message }, onEvent)
        ),
      resume: ({ runId, threadId, toolCallId, action }) =>
        void run({ threadId, message: null, resumeOf: runId }, async (onEvent) => {
          // The resumed stream only carries new events; start from the stored ones so the run reads whole.
          const earlier = await queryClient.fetchQuery({ queryKey: chatKeys.run(runId), queryFn: () => chatApi.runEvents(runId) })
          earlier.forEach(onEvent)
          await chatApi.resume(runId, action, { toolCallId }, onEvent)
          await queryClient.invalidateQueries({ queryKey: chatKeys.run(runId) })
        }),
    }),
    [active, mindId, queryClient, run]
  )

  return <ChatRunContext.Provider value={value}>{children}</ChatRunContext.Provider>
}

export function useChatRun(): ChatRun {
  const ctx = useContext(ChatRunContext)
  if (!ctx) throw new Error("useChatRun needs a ChatRunProvider (the Mind layout)")
  return ctx
}
