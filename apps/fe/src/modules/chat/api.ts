import { api } from "@/lib/api"
import { ownerTimeZone, stream } from "@/lib/stream"
import type { RunEvent } from "@/modules/runs/data/events"

// Chat, runs and approvals: docs/api-contract.md §7. Chat and approve/decline answer with an SSE
// stream of §3 events (`stream` in src/lib/stream.ts).

export type ApiMessage = { id: string; role: "user" | "assistant"; text: string; createdAt: string; runId: string }

const enc = encodeURIComponent

export const chatApi = {
  /** A page of a thread, oldest first. Pass `nextBefore` back as `before` for older runs. */
  messages: async (mindId: string, threadId: string, before?: string) =>
    api<{ messages: ApiMessage[]; nextBefore: string | null }>(
      `/minds/${enc(mindId)}/threads/${enc(threadId)}/messages?limit=50${before ? `&before=${enc(before)}` : ""}`
    ),
  /** Every stored event of a run, in `seq` order. */
  runEvents: async (runId: string) => (await api<{ events: RunEvent[] }>(`/runs/${enc(runId)}`)).events,

  send: (mindId: string, body: { message: string; threadId?: string }, onEvent: (e: RunEvent) => void, signal?: AbortSignal) =>
    stream<RunEvent>(`/minds/${enc(mindId)}/chat`, { ...body, ...ownerTimeZone() }, onEvent, signal),
  /** Stop a run that is still streaming (#121). Its stream then ends with run.finished "canceled". */
  cancel: (runId: string) => api<unknown>(`/runs/${enc(runId)}/cancel`, { method: "POST", body: {} }),
  resume: (
    runId: string,
    action: "approve" | "decline",
    body: { toolCallId: string; reason?: string },
    onEvent: (e: RunEvent) => void,
    signal?: AbortSignal
  ) => stream<RunEvent>(`/runs/${enc(runId)}/${action}`, { ...body, ...ownerTimeZone() }, onEvent, signal),
}
