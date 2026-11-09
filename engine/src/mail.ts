// The Mind's own email address (#96, AgentMail). Like the payment tools (#42): the backend holds the AgentMail key,
// the engine only gets a run-scoped mail token and calls the backend's /internal/v1/mail/* routes
// (docs/api-contract.md §2 "Mail tools").
import { z } from 'zod'

// The token lives in RequestContext as a Map, like secrets and the wallet token: run snapshots store the
// requestContext, and a Map serializes to {}, so the token never lands in the mastra tables.
export const MAIL_KEY = 'mail'
export const mailContext = (token: string | undefined) => new Map(token ? [['token', token]] : [])

export const mailTokenSchema = z.string().regex(/^mt_[A-Za-z0-9._~-]+$/, 'not a mail token').max(2048)

type Ctx = { requestContext?: { get: (key: string) => unknown } } | undefined

export class NoInboxError extends Error {
  constructor() { super('this Mind has no email address yet: the owner can turn on the "Email address" skill for it') }
}

// Calls one of the backend's internal mail routes with the engine key and the run's mail token.
export async function mailCall<T>(context: Ctx, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = (context?.requestContext?.get(MAIL_KEY) as Map<string, string> | undefined)?.get('token')
  if (!token) throw new NoInboxError()
  // Read per call, not at import: unit tests load the tools without the engine's config.
  const base = process.env.BACKEND_URL
  if (!base) throw new Error('BACKEND_URL is not set (see engine/.env.example)')
  const res = await fetch(new URL(path, base), {
    method,
    headers: { 'x-engine-key': process.env.ENGINE_API_KEY ?? '', 'x-mail-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(`mail: ${res.status} ${String(json.error ?? 'error')}${json.reason ? ` (${String(json.reason)})` : ''}`)
  return json as T
}

// Sends that AgentMail or our limits refused: no email went out. They become tool.error events.
export const MAIL_REFUSALS = new Set(['rejected', 'rate_limited'])
export const isMailRefusal = (tool: string | undefined, result: { status?: unknown } | undefined) => tool === 'mail_send' && MAIL_REFUSALS.has(String(result?.status))

// AgentMail's Idempotency-Key alphabet (docs.agentmail.to/idempotency): the tool call id, cleaned, so one approved
// call sends one email even if it runs twice.
export const idempotencyKeyOf = (toolCallId: unknown) =>
  typeof toolCallId === 'string' && toolCallId ? toolCallId.replace(/[^A-Za-z0-9._~-]/g, '-').slice(0, 128) : undefined
