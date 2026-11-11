import { createParser } from "eventsource-parser"
import { apiUrl, toApiError } from "@/lib/api"

// Chat, approve/decline, attacks and job runs answer a POST with an SSE stream of §3 events
// (`data: {json}` lines and `: ping` comments; docs/api-contract.md §3, §7). Errors before the
// stream starts come back as JSON with a status. EventSource can't POST, so the body is read here.

/** POST, then hand every event to `onEvent` until the stream ends. Throws `ApiError` before it starts. */
export async function stream<E>(path: string, body: unknown, onEvent: (e: E) => void, signal?: AbortSignal): Promise<void> {
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
        onEvent(JSON.parse(message.data) as E)
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

/** This browser's IANA time zone ("Asia/Jakarta"), or undefined when it can't say. */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/**
 * The owner's time zone for a run (`docs/api-contract.md`, #112), so "2pm tomorrow" and get_time
 * mean the owner's clock, not UTC. Left out when the browser can't say.
 */
export function ownerTimeZone(): { timeZone?: string } {
  const timeZone = browserTimeZone()
  return timeZone ? { timeZone } : {}
}
