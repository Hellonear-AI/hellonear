// Owners' Gmail through Composio (#13) against a fake Composio: sessions, mapping, errors. No network, LLM or database.
// Response shapes follow the v3.1 docs and the tools' output schemas (read 6 Nov 2026); the "no connection" answer
// was seen live.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { toolRegistry } from '../src/tools.ts'
import { USER_KEY, addressOf, resetComposioSessions } from '../src/composio.ts'

const calls: { method: string; url: string; key: unknown; body: any }[] = []
let expireNextSession = false
const fake = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  const body = raw ? JSON.parse(raw) : undefined
  calls.push({ method: req.method!, url: req.url!, key: req.headers['x-api-key'], body })
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.url === '/tool_router/session') return send(201, { session_id: `trs_${body.user_id}_${calls.length}`, mcp: { url: 'https://example.invalid', headers: { 'x-api-key': 'never-log-this' } } })
  const exec = req.url!.match(/^\/tool_router\/session\/([^/]+)\/execute$/)
  if (!exec) return send(404, {})
  if (expireNextSession) { expireNextSession = false; return send(404, { error: { slug: 'ToolRouterV2_SessionNotFound' } }) }
  if (exec[1].startsWith('trs_usr_none')) return send(400, { error: { message: "No active connection found for toolkit(s) 'gmail' in this session.", code: 4302, slug: 'ToolRouterV2_NoActiveConnection', status: 400 } })
  const msg = { messageId: '19b1', threadId: 't77', sender: 'Rina Hartono <rina@acme.example>', to: 'me@example.com', subject: 'Standup', messageText: 'Can you confirm?', preview: { body: 'Can you confirm?' }, messageTimestamp: '2026-11-06T01:00:00Z', labelIds: ['INBOX', 'UNREAD'] }
  if (body.tool_slug === 'GMAIL_FETCH_EMAILS') return send(200, { result_type: 'completed', data: { messages: [msg] }, error: null, log_id: 'l1' })
  if (body.tool_slug === 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID') {
    if (body.arguments.message_id === 'gone') return send(200, { result_type: 'failed', data: {}, error: 'Requested entity was not found.', log_id: 'l2' })
    return send(200, { result_type: 'completed', data: msg, error: null, log_id: 'l3' })
  }
  if (body.tool_slug === 'GMAIL_CREATE_EMAIL_DRAFT') return send(200, { result_type: 'completed', data: { id: 'r-draft-1', message: { id: 'm9', threadId: body.arguments.thread_id } }, error: null, log_id: 'l4' })
  send(400, { error: { slug: 'unknown_tool' } })
})

before(async () => {
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r))
  process.env.COMPOSIO_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`
  process.env.COMPOSIO_API_KEY = 'ak_test'
})
after(() => new Promise<void>((r) => fake.close(() => r())))
beforeEach(() => { calls.length = 0; resetComposioSessions() })

const ctx = (userId?: string) => ({ requestContext: { get: (k: string) => (k === USER_KEY ? userId : undefined) } })
const run = (tool: keyof typeof toolRegistry, input: unknown, userId?: string) => toolRegistry[tool].execute!(input as any, ctx(userId) as any) as Promise<any>

test('list: a session for the run\'s user, then GMAIL_FETCH_EMAILS, mapped to our shape', async () => {
  const out = await run('gmail_list_emails', { query: 'is:unread', maxResults: 5 }, 'usr_a')
  assert.deepEqual(out, { source: 'gmail', emails: [{ id: '19b1', from: 'Rina Hartono <rina@acme.example>', subject: 'Standup', snippet: 'Can you confirm?', receivedAt: '2026-11-06T01:00:00Z', unread: true }] })
  assert.deepEqual(calls[0].body, { user_id: 'usr_a', toolkits: { enable: ['gmail', 'googlecalendar'] }, manage_connections: { enable: false } })
  assert.equal(calls[0].key, 'ak_test')
  assert.deepEqual(calls[1].body, { tool_slug: 'GMAIL_FETCH_EMAILS', arguments: { max_results: 5, query: 'is:unread', verbose: false } })
})

test('the session is reused for the same user and never shared across users', async () => {
  await run('gmail_list_emails', {}, 'usr_a')
  await run('gmail_read_email', { id: '19b1' }, 'usr_a')
  await run('gmail_list_emails', {}, 'usr_b')
  const created = calls.filter((c) => c.url === '/tool_router/session').map((c) => c.body.user_id)
  assert.deepEqual(created, ['usr_a', 'usr_b'])
  const execA = calls.filter((c) => c.url.includes('trs_usr_a')).length
  assert.equal(execA, 2)
})

test('read and draft: the reply goes to the sender\'s address, in the same thread, as a draft only', async () => {
  const mail = await run('gmail_read_email', { id: '19b1' }, 'usr_a')
  assert.equal(mail.body, 'Can you confirm?')
  const draft = await run('gmail_create_draft', { replyToId: '19b1', body: 'Yes, see you at 10.' }, 'usr_a')
  assert.deepEqual(draft, { source: 'gmail', draftId: 'r-draft-1', to: 'rina@acme.example', subject: 'Re: Standup', body: 'Yes, see you at 10.', status: 'draft_only' })
  const create = calls.find((c) => c.body?.tool_slug === 'GMAIL_CREATE_EMAIL_DRAFT')!
  assert.deepEqual(create.body.arguments, { thread_id: 't77', recipient_email: 'rina@acme.example', subject: 'Re: Standup', body: 'Yes, see you at 10.' })
  assert.ok(!calls.some((c) => /SEND/.test(c.body?.tool_slug ?? '')), 'nothing is sent')
})

test('no Gmail connection, no user or no key: "Gmail is not connected"', async () => {
  await assert.rejects(run('gmail_list_emails', {}, 'usr_none'), /Gmail is not connected/)
  await assert.rejects(run('gmail_list_emails', {}), /Gmail is not connected/)
  const key = process.env.COMPOSIO_API_KEY
  delete process.env.COMPOSIO_API_KEY
  try {
    await assert.rejects(run('gmail_list_emails', {}, 'usr_a'), /Gmail is not connected/)
  } finally {
    process.env.COMPOSIO_API_KEY = key
  }
})

test('an expired session is replaced once; a failed tool call is an error', async () => {
  await run('gmail_list_emails', {}, 'usr_a')
  expireNextSession = true
  const out = await run('gmail_list_emails', {}, 'usr_a')
  assert.equal(out.emails.length, 1)
  assert.equal(calls.filter((c) => c.url === '/tool_router/session').length, 2)
  await assert.rejects(run('gmail_read_email', { id: 'gone' }, 'usr_a'), /gmail: Requested entity was not found/)
})

test('addresses are taken from "Name <address>"', () => {
  assert.equal(addressOf('Rina <rina@acme.example>'), 'rina@acme.example')
  assert.equal(addressOf(' plain@acme.example '), 'plain@acme.example')
})
