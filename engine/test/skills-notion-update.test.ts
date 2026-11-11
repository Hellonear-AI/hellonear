// Live prompt test for querying a Notion database and changing a row (#247 item 4): the Mind finds the database, reads
// the rows, then asks to change one with the old values on the card, and nothing is written before the owner approves.
// Real NEAR AI Cloud and the local Postgres; Composio is a fake that answers like the tools' latest output schemas (Notion
// page objects), so this proves the Mind's flow, not Notion's answers.
// Run: node --env-file=.env --import tsx --test test/skills-notion-update.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { server } from '../src/server.ts'
import { resetComposioSessions } from '../src/composio.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const userId = `usr_notion_${randomUUID().slice(0, 8)}`

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
type Row = { id: string; title: string; status: string; due: string }
// Two rows that look alike ("Send invoice" and "Send invoice to Dimas"): the Mind must pick the exact one.
const ROWS: Row[] = [
  { id: 'r11', title: 'Book flights', status: 'Done', due: day(-2) },
  { id: 'r12', title: 'Send invoice', status: 'In progress', due: day(1) },
  { id: 'r13', title: 'Send invoice to Dimas', status: 'Not started', due: day(3) },
  { id: 'r14', title: 'Renew domain', status: 'Not started', due: day(30) },
]
const page = (r: Row) => ({
  object: 'page', id: r.id, url: `https://www.notion.so/${r.id}`, archived: false, in_trash: false, last_edited_time: '2026-11-10T00:00:00Z',
  parent: { type: 'database_id', database_id: 'db-tasks' },
  properties: {
    Name: { id: 'title', type: 'title', title: [{ type: 'text', plain_text: r.title }] },
    Status: { id: 's', type: 'status', status: { id: r.status, name: r.status, color: 'default' } },
    Due: { id: 'd', type: 'date', date: { start: r.due, end: null } },
  },
})
// A small subset of Notion's filter, enough for what a Mind sends here; anything else matches (a lax server).
function matches(r: Row, f: any): boolean {
  if (!f || typeof f !== 'object') return true
  if (Array.isArray(f.and)) return f.and.every((x: any) => matches(r, x))
  if (Array.isArray(f.or)) return f.or.some((x: any) => matches(r, x))
  const value = f.property === 'Status' ? r.status : f.property === 'Due' ? r.due : r.title
  const cond = f.status ?? f.select ?? f.date ?? f.title ?? f.rich_text ?? {}
  if ('equals' in cond) return value === cond.equals
  if ('does_not_equal' in cond) return value !== cond.does_not_equal
  if ('contains' in cond) return value.toLowerCase().includes(String(cond.contains).toLowerCase())
  if ('on_or_before' in cond) return value <= String(cond.on_or_before).slice(0, 10)
  if ('on_or_after' in cond) return value >= String(cond.on_or_after).slice(0, 10)
  if ('before' in cond) return value < String(cond.before).slice(0, 10)
  if ('after' in cond) return value > String(cond.after).slice(0, 10)
  return true
}

const writes: any[] = []
const ok = (data: unknown) => ({ result_type: 'completed', error: null, data })
const answers: Record<string, (a: any) => unknown> = {
  NOTION_SEARCH_NOTION_PAGE: () => ok({ results: [{ object: 'database', id: 'db-tasks', url: 'https://www.notion.so/db-tasks', title: [{ plain_text: 'Tasks' }], last_edited_time: '2026-11-10T00:00:00Z' }] }),
  NOTION_QUERY_DATABASE_WITH_FILTER: (a) => ok({ object: 'list', type: 'page_or_database', has_more: false, results: ROWS.filter((r) => matches(r, a.filter)).map(page) }),
  NOTION_RETRIEVE_PAGE: (a) => { const r = ROWS.find((x) => x.id === a.page_id); return r ? ok(page(r)) : { result_type: 'failed', error: 'object_not_found', data: {} } },
  NOTION_UPDATE_ROW_DATABASE: (a) => { writes.push(a); return ok({ object: 'page', id: a.row_id, url: `https://www.notion.so/${a.row_id}` }) },
}
const fake = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  const body = raw ? JSON.parse(raw) : undefined
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.url === '/tool_router/session') return send(201, { session_id: `trs_${body.user_id}` })
  if (!/^\/tool_router\/session\/[^/]+\/execute$/.test(req.url!)) return send(404, {})
  const answer = answers[body.tool_slug]
  return answer ? send(200, answer(body.arguments)) : send(400, { error: { slug: 'unknown_tool' } })
})

before(async () => {
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r))
  process.env.COMPOSIO_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`
  process.env.COMPOSIO_API_KEY = 'ak_test'
  resetComposioSessions()
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(async () => {
  await new Promise<void>((r) => fake.close(() => r()))
  await new Promise<void>((r) => server.close(() => r()))
})

type Ev = Record<string, any>
const mind = { templateId: 'general-assistant', name: 'Nia', soul: { identity: 'You keep the owner\'s Notion task list up to date.', invariants: [], priors: [] }, skills: [{ skillId: 'notion' }] }
async function post(path: string, body: unknown): Promise<Ev[]> {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-key': key }, body: JSON.stringify(body) })
  assert.equal(res.status, 200, await res.clone().text())
  return (await res.text()).split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}
const toolsOf = (evs: Ev[]) => evs.filter((e) => e.type === 'tool.called').map((e) => e.tool)
// The card's args are the model's raw arguments: pick the fields the tool reads (the model once added `old-value` beside
// `oldValue`; Zod drops unknown keys before execute, so they never reach Notion).
const statusChange = (card: Ev) => {
  const p = (card.args.properties as any[]).find((x) => x.name === 'Status')
  return p && { name: p.name, type: p.type, oldValue: p.oldValue, newValue: p.newValue }
}

test('which tasks are due this week: it queries the database, asks for no approval, writes nothing', async () => {
  const evs = await post('/v1/minds/nia/chat', { userId, threadId: randomUUID(), mind, message: 'Which of my Notion tasks are due this week and not done yet?' })
  const tools = toolsOf(evs)
  assert.ok(tools.includes('notion_query_database'), JSON.stringify(tools))
  assert.ok(!evs.some((e) => e.type === 'tool.approval_required'), 'no approval for a read')
  assert.equal(writes.length, 0)
  const text = evs.filter((e) => e.type === 'text.delta').map((e) => e.delta ?? e.text ?? '').join('')
  assert.match(text, /Send invoice/, text)
  // Listed rows only; the reply may still mention a task due later as not due ("Renew domain is not due until 11 Dec").
  const listed = text.split('\n').filter((l) => /^\s*([-*•]|\d+[.)])\s/.test(l))
  assert.ok(listed.some((l) => /Send invoice/.test(l)), text)
  assert.ok(!listed.some((l) => /Renew domain|Book flights/.test(l)), `listed a task not due this week or done: ${text}`)
})

test("mark 'Send invoice' done: read first, the card shows old → new for the exact row, written only after approve", async () => {
  const threadId = randomUUID()
  const first = await post('/v1/minds/nia/chat', { userId, threadId, mind, message: "In my Notion Tasks, mark 'Send invoice' as done." })
  const tools = toolsOf(first)
  assert.equal(first.filter((e) => e.type === 'tool.result' && e.result?.error === true).length, 0, JSON.stringify(first.filter((e) => e.result?.error)))
  const card = first.find((e) => e.type === 'tool.approval_required' && e.tool === 'notion_update_row')
  assert.ok(card, JSON.stringify(tools))
  assert.ok(tools.indexOf('notion_query_database') !== -1 && tools.indexOf('notion_query_database') < tools.indexOf('notion_update_row'), `read before the change: ${tools}`)
  assert.equal(card.args.rowId, 'r12', `the exact row, not "Send invoice to Dimas": ${JSON.stringify(card.args)}`)
  assert.equal(card.args.rowTitle, 'Send invoice')
  assert.deepEqual(statusChange(card), { name: 'Status', type: 'status', oldValue: 'In progress', newValue: 'Done' })
  assert.equal(writes.length, 0, 'nothing written before approval')

  const rest = await post(`/v1/runs/${card.runId}/approve?mindId=nia`, { userId, threadId, mind, toolCallId: card.toolCallId })
  const done = rest.find((e) => e.type === 'tool.result' && e.tool === 'notion_update_row')
  assert.equal(done?.result?.status, 'updated', JSON.stringify(rest.filter((e) => e.tool)))
  assert.equal(writes.length, 1)
  assert.equal(writes[0].row_id, 'r12')
  assert.equal(writes[0].delete_row, false)
  assert.deepEqual(writes[0].properties.find((p: any) => p.name === 'Status'), { name: 'Status', type: 'status', value: 'Done' })
})

test('a row that changed after the card was shown is refused and nothing is written', async () => {
  const threadId = randomUUID()
  const before = writes.length
  const first = await post('/v1/minds/nia/chat', { userId, threadId, mind, message: "Mark 'Renew domain' as Done in my Notion Tasks." })
  const card = first.find((e) => e.type === 'tool.approval_required' && e.tool === 'notion_update_row')
  assert.ok(card, JSON.stringify(toolsOf(first)))
  assert.equal(card.args.rowId, 'r14')
  assert.equal(statusChange(card)?.oldValue, 'Not started')
  // Someone moves it on in Notion while the card waits.
  const row = ROWS.find((r) => r.id === 'r14')!
  row.status = 'In progress'
  try {
    const rest = await post(`/v1/runs/${card.runId}/approve?mindId=nia`, { userId, threadId, mind, toolCallId: card.toolCallId })
    const result = rest.find((e) => e.type === 'tool.result' && e.tool === 'notion_update_row')
    assert.equal(result?.result?.status, 'refused', JSON.stringify(rest.filter((e) => e.tool)))
    assert.match(result.result.message, /no longer holds/)
    assert.equal(writes.length, before, 'nothing written')
  } finally {
    row.status = 'Not started'
  }
})
