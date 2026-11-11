// Live prompt tests for "email me" in a chat (#205, point 2): the Mind uses mail_send_to_owner, which waits for the
// owner's approval and goes to the owner's own Gmail address, instead of asking for an address. Real NEAR AI Cloud and
// the local Postgres; the backend is a fake, so nothing is sent.
// Run: node --env-file=.env --import tsx --test test/skills-mail-owner.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { server } from '../src/server.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const userId = `test-user-${randomUUID()}`
const INBOX = 'mia-abc123@agentmail.to'
const MAIL_TOKEN = 'mt_fake.token'

// The backend's mail routes: /internal/v1/mail/owner sends to the owner's Gmail, which only the backend knows.
const ownerSends: Record<string, unknown>[] = []
const backend = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  const send = (json: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.url === '/internal/v1/mail/owner') {
    const body = JSON.parse(raw)
    ownerSends.push(body)
    return send({ sendId: `m-${ownerSends.length}`, status: 'sent', from: INBOX, to: ['owner@gmail.example'], subject: body.subject })
  }
  if (req.url?.startsWith('/internal/v1/mail/messages')) return send({ inbox: INBOX, shared: false, messages: [] })
  res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'not_found' }))
})

before(async () => {
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await new Promise<void>((r) => backend.listen(0, '127.0.0.1', r))
  process.env.BACKEND_URL = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`
})
after(async () => {
  await new Promise<void>((r) => backend.close(() => r()))
  await new Promise<void>((r) => server.close(() => r()))
})

type Ev = Record<string, any>
async function post(path: string, body: unknown) {
  return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-key': key }, body: JSON.stringify(body) })
}
async function events(res: Response): Promise<Ev[]> {
  assert.equal(res.status, 200, await res.clone().text())
  const text = await res.text()
  return text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}
const finalText = (evs: Ev[]) => evs.find((e) => e.type === 'run.finished')?.text ?? ''
const trace = (evs: Ev[]) => JSON.stringify({ tools: evs.filter((e) => e.tool).map((e) => `${e.type}:${e.tool}`), text: finalText(evs) })
const m = {
  templateId: 'general-assistant',
  name: 'Mia',
  soul: { identity: 'You are a helpful assistant.', invariants: ['Never invent facts.'], priors: [] },
  skills: [{ skillId: 'email-address' }],
}
// Asking the owner for their address is the bug from #205: "aku butuh alamat emailnya", "what's your email address?".
const asksForAddress = (t: string) => /alamat\s*(e-?mail|surel)|(what|which)('s| is)? your (e-?mail|address)|your (e-?mail )?address\?|(share|give|tell|type|send) me your (e-?mail|address)/i.test(t)
const run = (threadId: string, message: string) => post('/v1/minds/mia/chat', { userId, threadId, mailToken: MAIL_TOKEN, mind: m, message })
const answer = (verb: 'approve' | 'decline', threadId: string, ask: Ev) =>
  post(`/v1/runs/${ask.runId}/${verb}?mindId=mia`, { userId, threadId, mailToken: MAIL_TOKEN, mind: m, toolCallId: ask.toolCallId, ...(verb === 'decline' ? { reason: 'Owner declined' } : {}) })

test('"Email me a short note saying hi" asks to approve mail_send_to_owner, never for an address; approved, the backend picks the recipient', async () => {
  const threadId = randomUUID()
  const first = await events(await run(threadId, 'Email me a short note saying hi.'))
  const ask = first.find((e) => e.type === 'tool.approval_required' && e.tool === 'mail_send_to_owner')
  assert.ok(ask, trace(first))
  assert.ok(!first.some((e) => e.tool === 'mail_send'), `mail_send is for other people: ${trace(first)}`)
  assert.ok(!asksForAddress(finalText(first)), finalText(first))
  assert.equal(ask.args.to, undefined, 'the tool takes no recipient')
  assert.ok(ask.args.subject && /hi|hello/i.test(`${ask.args.subject} ${ask.args.text}`), JSON.stringify(ask.args))
  assert.equal(ownerSends.length, 0, 'nothing is sent before the owner approves')

  const rest = await events(await answer('approve', threadId, ask))
  assert.ok(rest.some((e) => e.type === 'tool.result' && e.tool === 'mail_send_to_owner'), trace(rest))
  assert.equal(ownerSends.length, 1)
  assert.deepEqual(Object.keys(ownerSends[0]).filter((k) => !['idempotencyKey'].includes(k)).sort(), ['mindId', 'subject', 'text', 'userId'])
  assert.deepEqual([ownerSends[0].userId, ownerSends[0].mindId], [userId, 'mia'])
  assert.ok(!asksForAddress(finalText(rest)), finalText(rest))
})

test('"kirim link ini ke emailku" puts the link in the email; a decline sends nothing', async () => {
  const threadId = randomUUID()
  const link = 'https://docs.google.com/document/d/1AbCdEf/edit'
  const before = ownerSends.length
  const first = await events(await run(threadId, `Tolong kirim link ini ke emailku: ${link}`))
  const ask = first.find((e) => e.type === 'tool.approval_required' && e.tool === 'mail_send_to_owner')
  assert.ok(ask, trace(first))
  assert.ok(!asksForAddress(finalText(first)), finalText(first))
  assert.ok(String(ask.args.text).includes(link), JSON.stringify(ask.args))
  const rest = await events(await answer('decline', threadId, ask))
  assert.ok(!rest.some((e) => e.type === 'tool.result' && e.tool === 'mail_send_to_owner'), trace(rest))
  assert.equal(ownerSends.length, before, 'declined: nothing sent')
})
