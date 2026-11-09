// App connections through Composio (#13): the owner connects Gmail once, Composio keeps the OAuth tokens.
// The Composio user id is our user id, so the engine can open a Composio session for the same user on a run.
// Tokens never pass through the backend: we only create Connect Links, read connection status and delete connections.
// REST v3.1 (docs.composio.dev, read 5 Nov 2026), checked live: session 201, link 201, list 200, delete 200.
import { z } from 'zod'
import { config } from './config.ts'
import { HttpError, UPSTREAM_ERROR, fetchFailure } from './http.ts'

// Composio toolkit slugs, checked live (6 Nov): both use Composio-managed Google OAuth. Calendar's default scopes are
// calendar + calendar.events; the engine only exposes list and create (with approval), see #57.
// googlemeet (#97): Composio-managed OAuth2 auth config `ac_ISu09_uuoKCK` (made by James 9 Nov, read live: ENABLED,
// scopes meetings.space.created + meetings.space.settings, so it can create Meet spaces but not read other meetings).
// The engine only creates Meet spaces.
export const TOOLKITS = ['gmail', 'googlecalendar', 'googlemeet'] as const
export const toolkitSchema = z.enum(TOOLKITS)
export type Toolkit = z.infer<typeof toolkitSchema>

export type ConnectionStatus = 'connected' | 'pending' | 'expired' | 'not_connected'
type Account = { id: string; user_id: string; status: string; toolkit: { slug: string }; created_at?: string; updated_at?: string }

async function composio(method: string, path: string, body?: unknown): Promise<any> {
  if (!config.composioApiKey) throw new HttpError(503, 'composio_not_configured')
  let res: Response
  try {
    res = await fetch(config.composioUrl + path, {
      method,
      headers: { 'x-api-key': config.composioApiKey, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    throw new HttpError(UPSTREAM_ERROR, 'composio_unreachable', { reason: fetchFailure(e) })
  }
  if (res.status === 404 && method === 'DELETE') return null
  if (!res.ok) throw new HttpError(UPSTREAM_ERROR, 'composio_error', { composioStatus: res.status })
  return res.json()
}

// Only this user's accounts: the filter is applied by Composio and checked again here.
async function accounts(userId: string, toolkit?: Toolkit): Promise<Account[]> {
  const q = new URLSearchParams({ user_ids: userId, toolkit_slugs: toolkit ?? TOOLKITS.join(',') })
  const body = await composio('GET', `/connected_accounts?${q}`)
  return ((body?.items ?? []) as Account[]).filter((a) => a.user_id === userId && (TOOLKITS as readonly string[]).includes(a.toolkit?.slug))
}

const statusOf = (s: string): Exclude<ConnectionStatus, 'not_connected'> =>
  s === 'ACTIVE' ? 'connected' : s === 'INITIATED' || s === 'INITIALIZING' ? 'pending' : 'expired'
const rank: Record<ConnectionStatus, number> = { connected: 3, pending: 2, expired: 1, not_connected: 0 }

export async function listConnections(userId: string) {
  const all = await accounts(userId)
  return TOOLKITS.map((toolkit) => {
    let best: { status: ConnectionStatus; since?: string } = { status: 'not_connected' }
    for (const a of all.filter((x) => x.toolkit.slug === toolkit)) {
      const status = statusOf(a.status)
      if (rank[status] > rank[best.status]) best = { status, since: a.updated_at ?? a.created_at }
    }
    return { toolkit, ...best }
  })
}

// Returns a Composio Connect Link. Unfinished attempts are removed first so each user has at most one per toolkit.
// After the owner signs in, Composio sends them to `${FE_ORIGIN}/connections?toolkit=…&status=…`; the FE then reads
// GET /v1/connections (the callback's query string is not proof of anything).
export async function connect(userId: string, toolkit: Toolkit): Promise<{ redirectUrl: string }> {
  const existing = await accounts(userId, toolkit)
  if (existing.some((a) => a.status === 'ACTIVE')) throw new HttpError(409, 'already_connected')
  for (const a of existing) await composio('DELETE', `/connected_accounts/${encodeURIComponent(a.id)}`)
  const session = await composio('POST', '/tool_router/session', {
    user_id: userId,
    toolkits: { enable: [toolkit] },
    manage_connections: { enable: false },
  })
  if (typeof session?.session_id !== 'string') throw new HttpError(UPSTREAM_ERROR, 'composio_error')
  const link = await composio('POST', `/tool_router/session/${encodeURIComponent(session.session_id)}/link`, {
    toolkit,
    callback_url: `${config.feOrigin}/connections?toolkit=${toolkit}`,
  })
  if (typeof link?.redirect_url !== 'string' || !link.redirect_url.startsWith('https://')) throw new HttpError(UPSTREAM_ERROR, 'composio_error')
  return { redirectUrl: link.redirect_url }
}

// Deletes every connection of this user for the toolkit (Composio revokes the stored tokens). false = none existed.
export async function disconnect(userId: string, toolkit: Toolkit): Promise<boolean> {
  const existing = await accounts(userId, toolkit)
  for (const a of existing) await composio('DELETE', `/connected_accounts/${encodeURIComponent(a.id)}`)
  return existing.length > 0
}
