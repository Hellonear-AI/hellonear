// A stand-in for the AgentMail REST v0 routes the backend uses (src/mail.ts), so tests need no AgentMail key.
// Shapes from docs.agentmail.to (Create Inbox, Send Message, List/Get Message, Error Reference; read 9 Nov 2026),
// including client_id idempotency, the per-organization inbox limit and Agent Armor fields. Records every request.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'

export const AGENTMAIL_KEYS = ['test-agentmail-key-0', 'test-agentmail-key-1']

type Inbox = { inbox_id: string; email: string; client_id?: string; display_name?: string; org: number }
type Message = { inbox_id: string; message_id: string; thread_id: string; from: string; to: string[]; subject: string; text: string; labels: string[]; timestamp: string; agent_armor?: unknown }

export const fakeAgentmail = {
  requests: [] as { method: string; path: string; key: string; idempotencyKey?: string; body: any }[],
  inboxes: [] as Inbox[],
  messages: [] as Message[],
  // Per organization (Free: 3). High by default so other tests never hit it.
  inboxLimit: 1000,
  // Answers the next send with this status and error body (e.g. 429 rate_limit_exceeded).
  failNextSend: null as null | { status: number; body: unknown; retryAfter?: string },
  sentKeys: new Map<string, string>(),
  receive(inboxId: string, m: Partial<Message>) {
    const msg: Message = { inbox_id: inboxId, message_id: `<${randomBytes(6).toString('hex')}@mail.example>`, thread_id: `thr-${randomBytes(4).toString('hex')}`, from: 'someone@example.com', to: [inboxId], subject: 'Hello', text: 'Hi there', labels: ['received'], timestamp: new Date().toISOString(), ...m }
    this.messages.push(msg)
    return msg
  },
}

const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body))
async function json(req: IncomingMessage) {
  let s = ''
  for await (const c of req) s += c
  return s ? JSON.parse(s) : undefined
}
const listItem = ({ text, ...m }: Message) => ({ ...m, preview: text.slice(0, 50), size: text.length, created_at: m.timestamp, updated_at: m.timestamp })

export const agentmailServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://agentmail')
  const body = await json(req)
  const key = String(req.headers.authorization ?? '').replace(/^Bearer /, '')
  fakeAgentmail.requests.push({ method: req.method!, path: url.pathname + url.search, key, idempotencyKey: req.headers['idempotency-key'] as string | undefined, body })
  const org = AGENTMAIL_KEYS.indexOf(key)
  if (org < 0) return send(res, 401, { name: 'UnauthorizedError', code: 'unknown_api_key', message: 'Unknown API key' })
  const p = url.pathname.replace(/^\/v0/, '')

  if (req.method === 'POST' && p === '/inboxes') {
    const same = fakeAgentmail.inboxes.find((i) => i.org === org && body?.client_id && i.client_id === body.client_id)
    if (same) return send(res, 200, { pod_id: 'pod', ...same, org: undefined })
    if (fakeAgentmail.inboxes.filter((i) => i.org === org).length >= fakeAgentmail.inboxLimit) return send(res, 403, { name: 'ForbiddenError', code: 'limit_exceeded', message: 'Inbox limit exceeded' })
    const email = `${body?.username ?? randomBytes(4).toString('hex')}@agentmail.to`
    if (fakeAgentmail.inboxes.some((i) => i.email === email)) return send(res, 409, { name: 'ConflictError', code: 'already_exists', message: 'Inbox already exists' })
    const inbox: Inbox = { inbox_id: email, email, client_id: body?.client_id, display_name: body?.display_name, org }
    fakeAgentmail.inboxes.push(inbox)
    return send(res, 200, { pod_id: 'pod', ...inbox, org: undefined, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  }

  // Delete inbox (docs: api-reference/inboxes/delete): asynchronous, 202 when it starts, 404 if unknown.
  const del = req.method === 'DELETE' && p.match(/^\/inboxes\/([^/]+)$/)
  if (del) {
    const i = fakeAgentmail.inboxes.findIndex((x) => x.inbox_id === decodeURIComponent(del[1]) && x.org === org)
    if (i < 0) return send(res, 404, { name: 'NotFoundError', code: 'not_found', message: 'Inbox not found' })
    fakeAgentmail.inboxes.splice(i, 1)
    return send(res, 202, {})
  }
  const m = p.match(/^\/inboxes\/([^/]+)\/messages(?:\/(send|[^/]+))?$/)
  const inbox = m && fakeAgentmail.inboxes.find((i) => i.inbox_id === decodeURIComponent(m[1]) && i.org === org)
  if (m && !inbox) return send(res, 404, { name: 'NotFoundError', code: 'not_found', message: 'Inbox not found' })
  if (m && inbox && req.method === 'POST' && m[2] === 'send') {
    if (fakeAgentmail.failNextSend) {
      const f = fakeAgentmail.failNextSend
      fakeAgentmail.failNextSend = null
      return send(res, f.status, f.body, f.retryAfter ? { 'retry-after': f.retryAfter } : {})
    }
    const ik = req.headers['idempotency-key'] as string | undefined
    if (ik && fakeAgentmail.sentKeys.has(ik)) {
      const prior = fakeAgentmail.messages.find((x) => x.message_id === fakeAgentmail.sentKeys.get(ik))!
      return send(res, 200, { message_id: prior.message_id, thread_id: prior.thread_id })
    }
    const to: string[] = Array.isArray(body.to) ? body.to : [body.to]
    // A send to the inbox itself is one message labelled sent, received and unread (seen live, 9 Nov).
    const labels = to.includes(inbox.email) ? ['sent', 'received', 'unread'] : ['sent']
    const msg = fakeAgentmail.receive(inbox.inbox_id, { from: inbox.email, to, subject: body.subject, text: body.text, labels })
    if (ik) fakeAgentmail.sentKeys.set(ik, msg.message_id)
    return send(res, 200, { message_id: msg.message_id, thread_id: msg.thread_id })
  }
  if (m && inbox && req.method === 'GET' && !m[2]) {
    const limit = Number(url.searchParams.get('limit') ?? 10)
    const list = fakeAgentmail.messages.filter((x) => x.inbox_id === inbox.inbox_id && !x.labels.includes('spam')).reverse().slice(0, limit)
    return send(res, 200, { count: list.length, limit, messages: list.map(listItem) })
  }
  if (m && inbox && req.method === 'GET' && m[2]) {
    // Message ids are looked up across the organization's inboxes, so the backend must check inbox_id itself.
    const found = fakeAgentmail.messages.find((x) => x.message_id === decodeURIComponent(m[2]) && fakeAgentmail.inboxes.find((i) => i.inbox_id === x.inbox_id)?.org === org)
    if (!found) return send(res, 404, { name: 'NotFoundError', code: 'not_found', message: 'Message not found' })
    return send(res, 200, { ...listItem(found), text: found.text })
  }
  send(res, 404, { name: 'NotFoundError', code: 'not_found', message: 'Not found' })
})
