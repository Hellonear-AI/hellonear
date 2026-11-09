// Email tools (#13, #43): the sample inbox for try-out runs, "not connected" for everyone else. No network, LLM or database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toolRegistry } from '../src/tools.ts'
import { DEMO_KEY, SAMPLE_INBOX, listSample } from '../src/email.ts'

const ctx = (demo: boolean) => ({ requestContext: { get: (k: string) => (k === DEMO_KEY ? demo : undefined) } })
const run = (tool: keyof typeof toolRegistry, input: unknown, demo: boolean) => toolRegistry[tool].execute!(input as any, ctx(demo) as any) as Promise<any>

test('try-out runs list the sample inbox, newest first, with a source marker', async () => {
  const now = Date.parse('2026-11-05T12:00:00Z')
  const { source, emails } = listSample({}, now)
  assert.equal(source, 'sample_inbox')
  assert.equal(emails.length, SAMPLE_INBOX.length)
  assert.equal(emails[0].receivedAt, '2026-11-05T11:00:00.000Z')
  assert.deepEqual(emails.map((e) => e.receivedAt), [...emails.map((e) => e.receivedAt)].sort().reverse())
  const out = await run('gmail_list_emails', { query: 'invoice', maxResults: 5 }, true)
  assert.deepEqual(out.emails.map((e: any) => e.id), ['demo-3'])
})

test('reading and drafting in the sample inbox; a draft is never sent', async () => {
  const mail = await run('gmail_read_email', { id: 'demo-2' }, true)
  assert.match(mail.body, /order #1042/)
  const draft = await run('gmail_create_draft', { replyToId: 'demo-2', body: 'Sorry, a replacement is on its way.' }, true)
  assert.deepEqual([draft.status, draft.subject, draft.to], ['draft_only', 'Re: Order #1042 arrived damaged', 'Dimas Pratama <dimas@kopikita.example>'])
  await assert.rejects(run('gmail_read_email', { id: 'nope' }, true), /no email with id nope/)
})

test('without demo, every email tool says Gmail is not connected', async () => {
  for (const [tool, input] of [['gmail_list_emails', {}], ['gmail_read_email', { id: 'demo-1' }], ['gmail_create_draft', { replyToId: 'demo-1', body: 'x' }]] as const) {
    await assert.rejects(run(tool, input, false), /Gmail is not connected/)
  }
})

test('there is no send tool and no email tool needs approval', () => {
  assert.ok(!Object.keys(toolRegistry).some((k) => /send_email|gmail_send/.test(k)))
  for (const k of ['gmail_list_emails', 'gmail_read_email', 'gmail_create_draft'] as const) assert.notEqual((toolRegistry[k] as any).requireApproval, true)
})

test('the sample inbox search understands OR, phrases and is:unread like Gmail does (#105)', () => {
  const ids = (query: string) => listSample({ query }).emails.map((e) => e.id).sort()
  assert.deepEqual(ids('receipt OR renewal OR renews OR invoice OR subscription'), ['demo-3', 'demo-7', 'demo-8'])
  assert.deepEqual(ids('invoice'), ['demo-3'])
  assert.deepEqual(ids('"order #1042"'), ['demo-2'])
  assert.deepEqual(ids('renews is:unread'), ['demo-8'])
  assert.deepEqual(ids('newer_than:7d receipt'), ['demo-7'])
  assert.deepEqual(ids('nothing-matches-this'), [])
})
