// Client for the backend HTTP API (docs/api-contract.md §7). Requests go to our own origin
// (`/api/v1/…`, forwarded by next.config.js), so the session cookie is sent automatically.

const API_BASE = "/api/v1"

/** A backend error: `{ error, ...details }` with an HTTP status. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, details: Record<string, unknown> = {}) {
    super(`${status} ${code}`)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    credentials: "include",
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (res.status === 204) return undefined as T

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const { error, ...details } = (data ?? {}) as { error?: unknown } & Record<string, unknown>
    throw new ApiError(res.status, typeof error === "string" ? error : "request_failed", details)
  }
  return data as T
}
