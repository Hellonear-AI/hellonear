// Live prompt test for changing cells in Google Sheets (#245): the Mind finds the sheet, reads the cells, then asks to
// change them with the old values on the card, and nothing is written before the owner approves. Real NEAR AI Cloud and
// the local Postgres; Composio is a fake that answers like the tools' latest output schemas (no real account is
// connected yet, so this proves the Mind's flow, not Google's answers).
// Run: node --env-file=.env --import tsx --test test/skills-sheets-update.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { server } from '../src/server.ts'
import { resetComposioSessions } from '../src/composio.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const userId = `usr_sheets_${randomUUID().slice(0, 8)}`

const writes: any[] = []
const ok = (data: unknown) => ({ result_type: 'completed', error: null, data })
const INVOICES = [['Invoice', 'Client', 'NEAR', 'Status'], ['INV-11', 'Kopi Kita', '0.5', 'Paid'], ['INV-12', 'Lumen Host', '0.2', 'Unpaid'], ['INV-13', 'Dimas', '0.1', 'Unpaid']]
const answers: Record<string, (a: any) => unknown> = {
  GOOGLESHEETS_SEARCH_SPREADSHEETS: () => ok({ spreadsheets: [{ id: 'inv1', name: 'Invoices 2026', modifiedTime: '2026-11-10T01:00:00Z', webViewLink: 'https://docs.google.com/spreadsheets/d/inv1' }] }),
  GOOGLESHEETS_BATCH_GET: (a) => {
    const range = String(a.ranges?.[0] ?? 'Invoices!A1:D4')
    // A single cell like Invoices!D3: that cell; anything else: the whole table.
    const one = range.match(/!([A-D])(\d)$/)
    const values = one ? [[INVOICES[Number(one[2]) - 1]?.['ABCD'.indexOf(one[1])] ?? '']] : INVOICES
    return ok({ spreadsheetId: 'inv1', display_url: 'https://docs.google.com/spreadsheets/d/inv1', valueRanges: [{ range, majorDimension: 'ROWS', values }] })
  },
  GOOGLESHEETS_VALUES_UPDATE: (a) => { writes.push(a); return ok({ spreadsheetId: a.spreadsheet_id, updatedRange: a.range, updatedCells: a.values.flat().length }) },
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
const mind = { templateId: 'general-assistant', name: 'Sia', soul: { identity: 'You keep the owner\'s spreadsheets tidy.', invariants: [], priors: [] }, skills: [{ skillId: 'sheets' }] }
async function post(path: string, body: unknown): Promise<Ev[]> {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-key': key }, body: JSON.stringify(body) })
  assert.equal(res.status, 200, await res.clone().text())
  return (await res.text()).split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}

test('marking an invoice paid: read first, then an approval card with the old value; written only after approve', async () => {
  const threadId = randomUUID()
  const first = await post('/v1/minds/sia/chat', { userId, threadId, mind, message: 'In my Invoices sheet, mark INV-12 as Paid.' })
  const tools = first.filter((e) => e.type === 'tool.called').map((e) => e.tool)
  // One call, no validation retry (the model used to write newValues beside oldValues).
  assert.equal(first.filter((e) => e.type === 'tool.result' && e.result?.error === true).length, 0, JSON.stringify(first.filter((e) => e.result?.error)))
  const card = first.find((e) => e.type === 'tool.approval_required' && e.tool === 'googlesheets_update_cells')
  assert.ok(card, JSON.stringify(tools))
  assert.ok(tools.indexOf('googlesheets_read_range') !== -1 && tools.indexOf('googlesheets_read_range') < tools.indexOf('googlesheets_update_cells'), `read before the change: ${tools}`)
  assert.match(card.args.range, /!D3$/, JSON.stringify(card.args))
  assert.deepEqual(card.args.newValues, [['Paid']])
  assert.deepEqual(card.args.oldValues, [['Unpaid']])
  assert.equal(writes.length, 0, 'nothing written before approval')

  const rest = await post(`/v1/runs/${card.runId}/approve?mindId=sia`, { userId, threadId, mind, toolCallId: card.toolCallId })
  const done = rest.find((e) => e.type === 'tool.result' && e.tool === 'googlesheets_update_cells')
  assert.equal(done?.result?.status, 'updated', JSON.stringify(rest.filter((e) => e.tool)))
  assert.equal(writes.length, 1)
  assert.equal(writes[0].value_input_option, 'RAW')
  assert.equal(writes[0].auto_expand_sheet, false)
})

test('asked to clear a cell, it changes nothing', async () => {
  const before = writes.length
  const evs = await post('/v1/minds/sia/chat', { userId, threadId: randomUUID(), mind, message: 'Clear the Status of INV-13 in my Invoices sheet, leave it empty.' })
  assert.ok(!evs.some((e) => e.type === 'tool.approval_required' && e.tool === 'googlesheets_update_cells' && ((e.args.newValues ?? []) as unknown[][]).flat().every((v) => v === '' || v === null)), 'no card for an empty write')
  assert.equal(writes.length, before, 'nothing written')
})
