import { createParser } from "eventsource-parser"
import { api, apiUrl, toApiError } from "@/lib/api"
import type { RunEvent } from "@/modules/chat/data/events"

// Chat, runs and approvals: docs/api-contract.md §7. Chat and approve/decline answer with an SSE
// stream of §3 events (`data: {json}` lines and `: ping` comments); errors before the stream
// starts come back as JSON with a status.

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
    stream(`/minds/${enc(mindId)}/chat`, { ...body, ...ownerTimeZone() }, onEvent, signal),
  /** Stop a run that is still streaming (#121). Its stream then ends with run.finished "canceled". */
  cancel: (runId: string) => api<unknown>(`/runs/${enc(runId)}/cancel`, { method: "POST", body: {} }),
  resume: (
    runId: string,
    action: "approve" | "decline",
    body: { toolCallId: string; reason?: string },
    onEvent: (e: RunEvent) => void,
    signal?: AbortSignal
  ) => stream(`/runs/${enc(runId)}/${action}`, { ...body, ...ownerTimeZone() }, onEvent, signal),
}

/**
 * The owner's time zone from the browser (`docs/api-contract.md`, #112), so "2pm tomorrow" and
 * get_time mean the owner's clock, not UTC. Left out when the browser can't say.
 */
export function ownerTimeZone(): { timeZone?: string } {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return timeZone ? { timeZone } : {}
  } catch {
    return {}
  }
}

/** POST, then hand every event to `onEvent` until the stream ends. Throws `ApiError` before it starts. */
export async function stream(path: string, body: unknown, onEvent: (e: RunEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw toApiError(res.status, await res.json().catch(() => null))

  const parser = createParser({
    onEvent: (message) => {
      try {
        onEvent(JSON.parse(message.data) as RunEvent)
      } catch {
        // Not one of ours; skip it rather than end the run.
      }
    },
  })
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    parser.feed(value)
  }
}
