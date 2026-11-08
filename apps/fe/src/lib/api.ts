// Client for the backend HTTP API (docs/api-contract.md §7).
// - Hosted (NEXT_PUBLIC_API_URL set): call the API directly. The FE and the API share a site
//   (hellonear.jameshub.fun and api-hellonear.jameshub.fun), so the SameSite=Lax cookie is sent,
//   and the backend sees each visitor's own IP (try-out limits are per IP; a proxy would make
//   every visitor share the host's IP).
// - Local dev (unset): `/api/v1/…` on our own origin, forwarded by next.config.js, so the cookie
//   is first-party on http://localhost too.

const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "")}/v1`
  : "/api/v1"

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
