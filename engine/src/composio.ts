// Owners' own Gmail through Composio (#13). The owner connects Gmail once through the backend (#45); Composio keeps
// the OAuth tokens. The Composio user id is our user id, so a session opened for the run's user only reaches that
// user's Gmail. REST v3.1 (docs.composio.dev, read 6 Nov 2026), checked live: a user without a connection gets
// 400 ToolRouterV2_NoActiveConnection.
import { GmailNotConnectedError } from './email.ts'

// The run's user, set by the server on every run. Not a secret; safe in run snapshots.
export const USER_KEY = 'userId'

type Ctx = { requestContext?: { get: (key: string) => unknown } } | undefined
export const userOf = (context: Ctx) => context?.requestContext?.get(USER_KEY) as string | undefined

// Read per call, not at import: unit tests point COMPOSIO_URL at a fake.
const base = () => process.env.COMPOSIO_URL ?? 'https://backend.composio.dev/api/v3.1'

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(base() + path, {
    method,
    headers: { 'x-api-key': process.env.COMPOSIO_API_KEY ?? '', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

// One session per user, reused for a while instead of one per tool call.
const SESSION_TTL_MS = 30 * 60 * 1000
const sessions = new Map<string, { id: string; at: number }>()
export const resetComposioSessions = () => sessions.clear()

async function sessionFor(userId: string): Promise<string> {
  const cached = sessions.get(userId)
  if (cached && Date.now() - cached.at < SESSION_TTL_MS) return cached.id
  const { status, json } = await call('POST', '/tool_router/session', { user_id: userId, toolkits: { enable: ['gmail'] }, manage_connections: { enable: false } })
  // The response also carries MCP connection details; keep only the id and never log the rest.
  if (status !== 200 && status !== 201) throw new Error(`gmail: composio session ${status}`)
  if (typeof json?.session_id !== 'string') throw new Error('gmail: composio session without id')
  sessions.set(userId, { id: json.session_id, at: Date.now() })
  return json.session_id
}

// Runs one Composio Gmail tool for the run's user and returns its `data`.
export async function gmail(context: Ctx, toolSlug: string, args: Record<string, unknown>): Promise<any> {
  const userId = userOf(context)
  if (!userId || !process.env.COMPOSIO_API_KEY) throw new GmailNotConnectedError()
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = await sessionFor(userId)
    const { status, json } = await call('POST', `/tool_router/session/${encodeURIComponent(id)}/execute`, { tool_slug: toolSlug, arguments: args })
    if (status === 400 && json?.error?.slug === 'ToolRouterV2_NoActiveConnection') throw new GmailNotConnectedError()
    // An expired session: open a new one once.
    if (status === 404 && attempt === 0) { sessions.delete(userId); continue }
    if (status !== 200) throw new Error(`gmail: composio ${status} ${String(json?.error?.slug ?? '')}`.trim())
    if (json.result_type === 'completed') return json.data
    throw new Error(`gmail: ${String(json.error ?? json.result_type ?? 'failed')}`)
  }
  throw new Error('gmail: composio session expired')
}

// Composio message → the shape our email tools return (the same as the sample inbox).
type ComposioMessage = { messageId: string; threadId?: string; sender?: string; to?: string; subject?: string; messageText?: string; preview?: { body?: string }; messageTimestamp?: string; labelIds?: string[] }
const MAX_BODY = 8000
export const toListed = (m: ComposioMessage) => ({
  id: m.messageId,
  from: m.sender ?? '',
  subject: m.subject ?? '',
  snippet: (m.preview?.body ?? m.messageText ?? '').replace(/\s+/g, ' ').slice(0, 160),
  receivedAt: m.messageTimestamp ?? '',
  unread: (m.labelIds ?? []).includes('UNREAD'),
})
export const toRead = (m: ComposioMessage) => ({
  id: m.messageId, from: m.sender ?? '', to: m.to ?? '', subject: m.subject ?? '',
  body: (m.messageText ?? '').slice(0, MAX_BODY), receivedAt: m.messageTimestamp ?? '',
})
// "Name <a@b.c>" or "a@b.c" → "a@b.c"
export const addressOf = (from: string) => (from.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? from.trim())
