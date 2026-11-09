// Owners' own apps through Composio: Gmail (#13), Google Calendar (#57) and Google Meet (#97). The owner connects each app once through
// the backend (#45); Composio keeps the OAuth tokens. The Composio user id is our user id, so a session opened for the
// run's user only reaches that user's apps. REST v3.1 (docs.composio.dev, read 6 Nov 2026), checked live (7 Nov): one
// session enables both toolkits, and a toolkit the user has not connected gets 400 ToolRouterV2_NoActiveConnection
// naming that toolkit.
import { AppNotConnectedError, type App } from './email.ts'

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

// Composio toolkit slugs, the same as the backend's `TOOLKITS`. googlemeet (#97) makes Meet links through the Meet
// REST API, which works without a paid Workspace account (Calendar's own create_meeting_room does not).
const TOOLKITS: App[] = ['gmail', 'googlecalendar', 'googlemeet']

// One session per user, reused for a while instead of one per tool call.
const SESSION_TTL_MS = 30 * 60 * 1000
const sessions = new Map<string, { id: string; at: number }>()
export const resetComposioSessions = () => sessions.clear()

async function sessionFor(userId: string): Promise<string> {
  const cached = sessions.get(userId)
  if (cached && Date.now() - cached.at < SESSION_TTL_MS) return cached.id
  const { status, json } = await call('POST', '/tool_router/session', { user_id: userId, toolkits: { enable: TOOLKITS }, manage_connections: { enable: false } })
  // The response also carries MCP connection details; keep only the id and never log the rest.
  if (status !== 200 && status !== 201) throw new Error(`composio session ${status}`)
  if (typeof json?.session_id !== 'string') throw new Error('composio session without id')
  sessions.set(userId, { id: json.session_id, at: Date.now() })
  return json.session_id
}

// Runs one Composio tool of `app` for the run's user and returns its `data`.
export async function composioTool(context: Ctx, app: App, toolSlug: string, args: Record<string, unknown>): Promise<any> {
  const userId = userOf(context)
  if (!userId || !process.env.COMPOSIO_API_KEY) throw new AppNotConnectedError(app)
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = await sessionFor(userId)
    const { status, json } = await call('POST', `/tool_router/session/${encodeURIComponent(id)}/execute`, { tool_slug: toolSlug, arguments: args })
    if (status === 400 && json?.error?.slug === 'ToolRouterV2_NoActiveConnection') throw new AppNotConnectedError(app)
    // An expired session: open a new one once.
    if (status === 404 && attempt === 0) { sessions.delete(userId); continue }
    if (status !== 200) throw new Error(`${app}: composio ${status} ${String(json?.error?.slug ?? '')}`.trim())
    if (json.result_type === 'completed') return json.data
    throw new Error(`${app}: ${String(json.error ?? json.result_type ?? 'failed')}`)
  }
  throw new Error(`${app}: composio session expired`)
}
export const gmail = (context: Ctx, toolSlug: string, args: Record<string, unknown>) => composioTool(context, 'gmail', toolSlug, args)

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
