"use client"

import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { chatKeys } from "@/lib/queryKeys"
import { chatApi, type ApiMessage } from "@/modules/chat/api"
import { foldRun, type RunView } from "@/modules/runs/data/events"
import { useSession } from "@/modules/auth/hooks/useSession"

export { chatKeys } from "@/lib/queryKeys"

/** One exchange in a thread: what the user said and how the run answered. */
export type Turn = {
  runId: string
  message: string | null
  createdAt: string
  /** From the run's events once they are read; until then only the stored reply text. */
  view: RunView
  /** The run's events are read, so its status is known (canceled, error...), not just guessed. */
  read: boolean
}

/**
 * A thread's turns, oldest first. Messages come from `…/messages` (whole runs per page); each
 * run's events (`GET /runs/{runId}`) add what text alone can't show: payments, approvals, the badge.
 */
export function useThread(mindId: string, threadId: string | null) {
  const signedIn = Boolean(useSession().data)
  const messages = useInfiniteQuery({
    queryKey: chatKeys.thread(mindId, threadId ?? "none"),
    enabled: signedIn && Boolean(threadId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => chatApi.messages(mindId, threadId!, pageParam),
    getNextPageParam: (page) => page.nextBefore ?? undefined,
  })

  // Pages are newest first; each page is oldest first.
  const all = useMemo(() => [...(messages.data?.pages ?? [])].reverse().flatMap((p) => p.messages), [messages.data])
  const runIds = useMemo(() => [...new Set(all.map((m) => m.runId))], [all])

  const runs = useQueries({
    queries: runIds.map((runId) => ({
      queryKey: chatKeys.run(runId),
      queryFn: () => chatApi.runEvents(runId),
      enabled: signedIn,
      staleTime: Infinity,
    })),
  })

  const turns = toTurns(all, new Map(runIds.map((id, i) => [id, runs[i]?.data ? foldRun(runs[i].data) : null])))

  return { ...messages, turns }
}

export function toTurns(messages: ApiMessage[], views: Map<string, RunView | null>): Turn[] {
  const turns: Turn[] = []
  const byRun = new Map<string, Turn>()
  for (const m of messages) {
    let turn = byRun.get(m.runId)
    if (!turn) {
      const fallback: RunView = { runId: m.runId, threadId: null, text: "", parts: [], tools: [], status: "finished", verified: null, error: null, thinking: false, at: m.createdAt, workMs: 0 }
      turn = { runId: m.runId, message: null, createdAt: m.createdAt, view: views.get(m.runId) ?? fallback, read: Boolean(views.get(m.runId)) }
      byRun.set(m.runId, turn)
      turns.push(turn)
    }
    if (m.role === "user") turn.message = m.text
    // Fill the text from the stored message when the events aren't read yet, or when they carry
    // no text but the message does (a reply must never vanish because its deltas are missing).
    else if (!views.get(m.runId) || !turn.view.text.trim()) {
      const text = turn.view.text + m.text
      turn.view = { ...turn.view, text, parts: [...turn.view.parts, { kind: "text", text: m.text }], at: m.createdAt }
    }
  }
  return turns
}

/**
 * The owner's own message that started a run, as the reason for a request it paused on
 * (Approvals' "You asked"; the payment tool carries no reason of its own).
 */
export function useAskedFor(mindId: string, run: { runId: string; threadId: string }): string | null {
  const { data } = useQuery({
    queryKey: chatKeys.asked(run.runId),
    queryFn: async () => {
      const { messages } = await chatApi.messages(mindId, run.threadId)
      return messages.find((m) => m.runId === run.runId && m.role === "user")?.text ?? null
    },
    staleTime: Infinity,
  })
  return data ?? null
}
