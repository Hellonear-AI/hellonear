// A stand-in for the Composio REST v3.1 routes the backend uses (src/connections.ts), so tests need no Composio key.
// Shapes copied from live responses (5 Nov 2026). Records every request.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'

export const COMPOSIO_KEY = 'test-composio-key'

type Account = { id: string; user_id: string; status: string; toolkit: { slug: string }; created_at: string; updated_at: string }
export const fakeComposio = {
  requests: [] as { method: string; path: string; body: any }[],
  accounts: [] as Account[],
  sessions: new Map<string, string>(),
  failNext: 0,
  activate(userId: string, toolkit = 'gmail') {
    for (const a of this.accounts) if (a.user_id === userId && a.toolkit.slug === toolkit) a.status = 'ACTIVE'
  },
}

const id = (p: string) => `${p}_${randomBytes(6).toString('hex')}`
const send = (res: ServerResponse, status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
async function json(req: IncomingMessage) {
  let s = ''
  for await (const c of req) s += c
  return s ? JSON.parse(s) : undefined
}

export const composioServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://composio')
  const body = await json(req)
  fakeComposio.requests.push({ method: req.method!, path: url.pathname + url.search, body })
  if (req.headers['x-api-key'] !== COMPOSIO_KEY) return send(res, 401, { error: { slug: 'APIKey_InvalidAPIKey' } })
  if (fakeComposio.failNext > 0) { fakeComposio.failNext--; return send(res, 500, { error: { message: 'boom' } }) }

  if (req.method === 'GET' && url.pathname === '/connected_accounts') {
    const users = url.searchParams.get('user_ids')?.split(',') ?? []
    const kits = url.searchParams.get('toolkit_slugs')?.split(',') ?? []
    return send(res, 200, { items: fakeComposio.accounts.filter((a) => users.includes(a.user_id) && (!kits.length || kits.includes(a.toolkit.slug))) })
  }
  const del = url.pathname.match(/^\/connected_accounts\/([^/]+)$/)
  if (req.method === 'DELETE' && del) {
    const i = fakeComposio.accounts.findIndex((a) => a.id === del[1])
    if (i < 0) return send(res, 404, { error: { message: 'not found' } })
    fakeComposio.accounts.splice(i, 1)
    return send(res, 200, { success: true })
  }
  if (req.method === 'POST' && url.pathname === '/tool_router/session') {
    const sessionId = id('trs')
    fakeComposio.sessions.set(sessionId, body.user_id)
    return send(res, 201, { session_id: sessionId, mcp: { type: 'http', url: `https://composio.invalid/${sessionId}/mcp` } })
  }
  const link = url.pathname.match(/^\/tool_router\/session\/([^/]+)\/link$/)
  if (req.method === 'POST' && link) {
    const userId = fakeComposio.sessions.get(link[1])
    if (!userId) return send(res, 404, { error: { message: 'no session' } })
    const now = new Date().toISOString()
    const account = { id: id('ca'), user_id: userId, status: 'INITIALIZING', toolkit: { slug: body.toolkit }, created_at: now, updated_at: now }
    fakeComposio.accounts.push(account)
    return send(res, 201, { link_token: id('lk'), redirect_url: `https://connect.composio.invalid/link/${account.id}`, connected_account_id: account.id })
  }
  send(res, 404, { error: { message: 'unknown route' } })
})
