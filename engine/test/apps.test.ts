// Business-app tools (#194: Sheets, Drive, Docs, Slack, Notion, Outlook) against a fake Composio. No network, LLM or
// database. Arguments follow the tools' latest input schemas and answers their output schemas (read live 11 Nov 2026);
// no real account was connected, so the answers are not seen live yet. The "no connection" answer copies Gmail's.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { needsApproval, toolRegistry, toolsFor } from '../src/tools.ts'
import { USER_KEY, resetComposioSessions } from '../src/composio.ts'
import { DEMO_KEY } from '../src/email.ts'
import { docText, htmlText, notionText, notionTitle, sheetRange, startRow } from '../src/apps.ts'
import { nodeIdFor } from '../src/graph.ts'

const calls: { url: string; body: any }[] = []
const ok = (data: unknown) => ({ result_type: 'completed', error: null, data })
const INVOICE_CELLS: Record<string, unknown[][]> = { 'Invoices!D7': [['Unpaid']], 'Invoices!D7:E7': [['Unpaid', '1']] }
const answers: Record<string, (a: any) => unknown> = {
  GOOGLESHEETS_SEARCH_SPREADSHEETS: () => ok({ spreadsheets: [{ id: 'sh1', name: 'Expenses 2026', modifiedTime: '2026-11-10T01:00:00Z', webViewLink: 'https://docs.google.com/spreadsheets/d/sh1' }], total_found: 1 }),
  // Invoices!… answers the cells an update reads back just before writing (#245); anything else, the Costs table.
  GOOGLESHEETS_BATCH_GET: (a) => String(a.ranges?.[0]).startsWith('Invoices!')
    ? ok({ spreadsheetId: 'sh1', valueRanges: [{ range: a.ranges[0], majorDimension: 'ROWS', values: INVOICE_CELLS[a.ranges[0]] ?? [] }] })
    : ok({ spreadsheetId: 'sh1', display_url: 'https://docs.google.com/spreadsheets/d/sh1', valueRanges: [{ range: a.ranges?.[0] ?? 'Costs!A1:C3', majorDimension: 'ROWS', values: [['Date', 'Item', 'NEAR'], ['2026-11-01', 'Hosting', '0.02']] }] }),
  GOOGLESHEETS_VALUES_UPDATE: (a) => ok({ spreadsheetId: a.spreadsheet_id, updatedRange: a.range, updatedRows: a.values.length, updatedColumns: a.values[0].length, updatedCells: a.values.flat().length }),
  GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND: (a) => ok({ spreadsheetId: a.spreadsheetId, tableRange: 'Costs!A1:C2', updates: { updatedRange: 'Costs!A3:C3', updatedRows: 1, updatedCells: a.values[0].length } }),
  GOOGLEDRIVE_FIND_FILE: () => ok({ files: [
    { id: 'd1', name: 'Contract', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-11-09T00:00:00Z', webViewLink: 'https://docs.google.com/document/d/d1' },
    { id: 'd2', name: 'Old', mimeType: 'application/pdf', trashed: true },
  ] }),
  GOOGLEDOCS_GET_DOCUMENT_BY_ID: (a) => ok({ documentId: a.id, title: 'Contract', document_url: 'https://docs.google.com/document/d/d1/edit', body: { content: [
    { paragraph: { elements: [{ textRun: { content: 'Payment terms: ' } }, { textRun: { content: '30 days.\n' } }] } },
    { table: { tableRows: [{ tableCells: [{ content: [{ paragraph: { elements: [{ textRun: { content: 'Fee\n' } }] } }] }] }] } },
  ] } }),
  GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN: (a) => ok({ documentId: 'newdoc', title: a.title, display_url: 'https://docs.google.com/document/d/newdoc/edit' }),
  SLACK_LIST_ALL_CHANNELS: () => ok({ ok: true, channels: [{ id: 'C1', name: 'finance', is_private: false, is_member: true }, { id: 'C2', name: 'founders', is_private: true }] }),
  SLACK_SEND_MESSAGE: (a) => (a.channel === 'gone' ? ok({ ok: false, error: 'channel_not_found' }) : ok({ ok: true, channel: 'C1', ts: '1731300000.000100' })),
  NOTION_SEARCH_NOTION_PAGE: () => ok({ results: [
    { id: 'p1', object: 'page', url: 'https://www.notion.so/p1', last_edited_time: '2026-11-10T00:00:00Z', properties: { Name: { type: 'title', title: [{ plain_text: 'CRM' }] } } },
    { id: 'p2', object: 'page', archived: true, properties: {} },
  ] }),
  NOTION_FETCH_BLOCK_CONTENTS: () => ok({ has_more: false, results: [
    { type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Clients' }] } },
    { type: 'to_do', to_do: { checked: true, rich_text: [{ plain_text: 'Call Dimas' }] } },
    { type: 'divider', divider: {} },
  ] }),
  NOTION_CREATE_NOTION_PAGE: () => ok({ id: 'np1', url: 'https://www.notion.so/np1' }),
  NOTION_INSERT_ROW_DATABASE: () => ok({ id: 'row1', url: 'https://www.notion.so/row1' }),
  OUTLOOK_LIST_MESSAGES: () => ok({ value: [{ id: 'AAMk1', subject: 'Invoice', bodyPreview: 'Please  pay\nby Friday', receivedDateTime: '2026-11-10T02:00:00Z', isRead: false, from: { emailAddress: { name: 'Lumen Billing', address: 'billing@lumenhost.example' } } }] }),
  OUTLOOK_GET_MESSAGE: (a) => ok({ id: a.message_id, subject: 'Invoice', receivedDateTime: '2026-11-10T02:00:00Z', from: { emailAddress: { address: 'billing@lumenhost.example' } },
    toRecipients: [{ emailAddress: { name: 'Me', address: 'me@example.com' } }], body: { contentType: 'html', content: '<p>Hello &amp; welcome</p><p>Pay <b>0.02 NEAR</b></p>' } }),
  OUTLOOK_CREATE_DRAFT_REPLY: () => ok({ id: 'draft9', subject: 'RE: Invoice', toRecipients: [{ emailAddress: { address: 'billing@lumenhost.example' } }] }),
}
const fake = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  const body = raw ? JSON.parse(raw) : undefined
  calls.push({ url: req.url!, body })
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.url === '/tool_router/session') return send(201, { session_id: `trs_${body.user_id}_${calls.length}` })
  const exec = req.url!.match(/^\/tool_router\/session\/([^/]+)\/execute$/)
  if (!exec) return send(404, {})
  const none = exec[1].match(/^trs_usr_no([a-z]+)_/)
  if (none && body.tool_slug.toLowerCase().startsWith(none[1])) {
    return send(400, { error: { message: `No active connection found for toolkit(s) '${none[1]}' in this session.`, code: 4302, slug: 'ToolRouterV2_NoActiveConnection', status: 400 } })
  }
  const answer = answers[body.tool_slug]
  if (!answer) return send(400, { error: { slug: 'unknown_tool' } })
  send(200, answer(body.arguments))
})

before(async () => {
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r))
  process.env.COMPOSIO_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`
  process.env.COMPOSIO_API_KEY = 'ak_test'
})
after(() => new Promise<void>((r) => fake.close(() => r())))
beforeEach(() => { calls.length = 0; resetComposioSessions() })

const ctx = (userId?: string, demo = false) => ({ requestContext: { get: (k: string) => (k === USER_KEY ? userId : k === DEMO_KEY ? demo : undefined) } })
const run = (tool: keyof typeof toolRegistry, input: unknown, c: unknown = ctx('usr_a')) => toolRegistry[tool].execute!(input as any, c as any) as Promise<any>
const exec = (slug: string) => calls.find((c) => c.body?.tool_slug === slug)!.body.arguments

const WRITES = ['googlesheets_append_row', 'googlesheets_update_cells', 'googledocs_create_document', 'slack_send_message', 'notion_create_page', 'notion_add_row'] as const
const READS = ['googlesheets_find_spreadsheets', 'googlesheets_read_range', 'googledrive_find_files', 'googledocs_read_document', 'slack_list_channels', 'notion_search', 'notion_read_page', 'outlook_list_emails', 'outlook_read_email', 'outlook_create_draft'] as const

test('writes and posts wait for approval, reads and drafts do not, and unattended runs never get a write', () => {
  for (const t of WRITES) assert.equal(needsApproval(t), true, t)
  for (const t of READS) assert.equal(needsApproval(t), false, t)
  assert.deepEqual(Object.keys(toolsFor([...WRITES, 'notion_search'], { unattended: true })), ['get_time', 'notion_search'])
})

test('sheets: search by name and content, read a range, append one row as RAW text', async () => {
  const found = await run('googlesheets_find_spreadsheets', { query: 'Expenses' })
  assert.deepEqual(exec('GOOGLESHEETS_SEARCH_SPREADSHEETS'), { query: 'Expenses', search_type: 'both', max_results: 10 })
  assert.deepEqual(found.spreadsheets, [{ id: 'sh1', name: 'Expenses 2026', modifiedAt: '2026-11-10T01:00:00Z', link: 'https://docs.google.com/spreadsheets/d/sh1' }])
  const read = await run('googlesheets_read_range', { spreadsheetId: 'sh1', range: 'Costs!A1:C3' })
  assert.deepEqual(exec('GOOGLESHEETS_BATCH_GET'), { spreadsheet_id: 'sh1', ranges: ['Costs!A1:C3'] })
  assert.deepEqual([read.range, read.values.length, read.truncated], ['Costs!A1:C3', 2, false])
  const added = await run('googlesheets_append_row', { spreadsheetId: 'sh1', sheet: "Q4 o'costs", values: ['2026-11-11', '=HYPERLINK("x")', 0.02, null] })
  assert.deepEqual(exec('GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND'), {
    spreadsheetId: 'sh1', range: "'Q4 o''costs'!A1", valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', majorDimension: 'ROWS', values: [['2026-11-11', '=HYPERLINK("x")', 0.02, null]],
  })
  assert.deepEqual(added, { source: 'googlesheets', spreadsheetId: 'sh1', updatedRange: 'Costs!A3:C3', updatedCells: 4, status: 'appended' })
  assert.equal(sheetRange('Sheet1'), "'Sheet1'!A1")
})

test('sheets: change cells as RAW text without growing the sheet; all-empty values are refused before any card (#245)', async () => {
  const changed = await run('googlesheets_update_cells', { spreadsheetId: 'sh1', range: 'Invoices!D7', newValues: [['Paid']], oldValues: [['Unpaid']] })
  assert.deepEqual(exec('GOOGLESHEETS_VALUES_UPDATE'), {
    spreadsheet_id: 'sh1', range: 'Invoices!D7', value_input_option: 'RAW', major_dimension: 'ROWS', values: [['Paid']], auto_expand_sheet: false, include_values_in_response: false,
  })
  assert.deepEqual(changed, { source: 'googlesheets', spreadsheetId: 'sh1', updatedRange: 'Invoices!D7', updatedCells: 1, status: 'updated' })
  // A formula-looking value stays text (RAW), as with append.
  await run('googlesheets_update_cells', { spreadsheetId: 'sh1', range: 'Invoices!D7:E7', newValues: [['=IMPORTXML("x")', 2]], oldValues: [['Unpaid', 1]] })
  assert.deepEqual(calls.filter((c) => c.body?.tool_slug === 'GOOGLESHEETS_VALUES_UPDATE').at(-1)!.body.arguments.values, [['=IMPORTXML("x")', 2]])
  // Clearing: refused by beforeApproval (no card) and again in execute, never sent to Composio.
  calls.length = 0
  const tool = (toolRegistry as any).googlesheets_update_cells
  const before = await tool.beforeApproval({ spreadsheetId: 'sh1', range: 'Invoices!D7', newValues: [[''], [null]], oldValues: [['a'], ['b']] }, {})
  assert.equal(before.proceed, false)
  assert.equal(before.output.status, 'refused')
  assert.equal(await tool.beforeApproval({ spreadsheetId: 'sh1', range: 'Invoices!D7', newValues: [['Paid']], oldValues: [['Unpaid']] }, {}), undefined)
  const refused = await run('googlesheets_update_cells', { spreadsheetId: 'sh1', range: 'Invoices!D7', newValues: [['  ']], oldValues: [['x']] })
  assert.equal(refused.status, 'refused')
  assert.equal(calls.length, 0)
  // The cells changed since the owner saw them (or the range was wrong and holds something else): nothing is written.
  calls.length = 0
  const stale = await run('googlesheets_update_cells', { spreadsheetId: 'sh1', range: 'Invoices!D7', newValues: [['Paid']], oldValues: [['Overdue']] })
  assert.equal(stale.status, 'refused')
  assert.match(stale.message, /no longer holds/)
  assert.ok(!calls.some((c) => c.body?.tool_slug === 'GOOGLESHEETS_VALUES_UPDATE'), 'not written')
  // Reads give each row's sheet number, so the Mind never counts rows itself.
  const read = await run('googlesheets_read_range', { spreadsheetId: 'sh1', range: 'Costs!A5:C6' })
  assert.deepEqual([read.firstRow, read.rowNumbers], [5, [5, 6]])
  assert.equal(startRow('Costs'), 1)
  assert.equal(startRow("Q4 o'costs!B12:C20"), 12)
  // The range must name the tab and be a cell or a block.
  const schema = tool.inputSchema
  for (const bad of ['D7', 'Invoices!', 'Invoices!D0', 'Invoices!7D']) assert.equal(schema.safeParse({ spreadsheetId: 's', range: bad, newValues: [['x']], oldValues: [['y']] }).success, false, bad)
  assert.equal(schema.safeParse({ spreadsheetId: 's', range: "Q4 o'costs!B2:C3", newValues: [['x', 'y']], oldValues: [['a', 'b']] }).success, true)
})

test('drive and docs: find files (trashed left out), read a doc as plain text, create a doc from Markdown', async () => {
  const found = await run('googledrive_find_files', { query: 'contract', maxResults: 5 })
  assert.deepEqual(exec('GOOGLEDRIVE_FIND_FILE'), { q: 'contract', pageSize: 5 })
  assert.deepEqual(found.files.map((f: any) => f.id), ['d1'])
  const doc = await run('googledocs_read_document', { id: 'd1' })
  assert.deepEqual(exec('GOOGLEDOCS_GET_DOCUMENT_BY_ID'), { id: 'd1' })
  assert.deepEqual(doc, { source: 'googledocs', id: 'd1', title: 'Contract', text: 'Payment terms: 30 days.\nFee\n', link: 'https://docs.google.com/document/d/d1/edit' })
  const made = await run('googledocs_create_document', { title: 'Invoice 7', markdown: '# Invoice 7' })
  assert.deepEqual(exec('GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN'), { title: 'Invoice 7', markdown_text: '# Invoice 7' })
  assert.deepEqual(made, { source: 'googledocs', documentId: 'newdoc', title: 'Invoice 7', link: 'https://docs.google.com/document/d/newdoc/edit', status: 'created' })
  assert.equal(docText({ a: [{ textRun: { content: 'x' } }, { b: { textRun: { content: 'y' } } }] }), 'xy')
})

test('slack: list channels with an explicit limit, post Markdown without the #, and a Slack refusal is an error', async () => {
  const list = await run('slack_list_channels', {})
  assert.deepEqual(exec('SLACK_LIST_ALL_CHANNELS'), { limit: 200, types: 'public_channel,private_channel', exclude_archived: true })
  assert.deepEqual(list.channels, [{ id: 'C1', name: 'finance', private: false, member: true }, { id: 'C2', name: 'founders', private: true, member: false }])
  const sent = await run('slack_send_message', { channel: '#finance', text: '*Weekly:* 0.3 NEAR spent' })
  assert.deepEqual(exec('SLACK_SEND_MESSAGE'), { channel: 'finance', markdown_text: '*Weekly:* 0.3 NEAR spent' })
  assert.deepEqual(sent, { source: 'slack', channel: 'C1', ts: '1731300000.000100', status: 'sent' })
  await assert.rejects(run('slack_send_message', { channel: 'gone', text: 'hi' }), /Slack refused: channel_not_found/)
})

test('notion: search titles (archived left out), read blocks as text, create a page and a row', async () => {
  const found = await run('notion_search', { query: 'CRM' })
  assert.deepEqual(exec('NOTION_SEARCH_NOTION_PAGE'), { query: 'CRM', filter_value: 'page', page_size: 10 })
  assert.deepEqual(found.results, [{ id: 'p1', kind: 'page', title: 'CRM', url: 'https://www.notion.so/p1', editedAt: '2026-11-10T00:00:00Z' }])
  const page = await run('notion_read_page', { pageId: 'p1' })
  assert.deepEqual(exec('NOTION_FETCH_BLOCK_CONTENTS'), { block_id: 'p1', page_size: 100 })
  assert.deepEqual([page.text, page.more], ['Clients\n[x] Call Dimas', false])
  const made = await run('notion_create_page', { parentId: 'p1', title: 'Meeting notes', markdown: '- agreed' })
  assert.deepEqual(exec('NOTION_CREATE_NOTION_PAGE'), { parent_id: 'p1', title: 'Meeting notes', markdown: '- agreed' })
  assert.deepEqual(made, { source: 'notion', pageId: 'np1', url: 'https://www.notion.so/np1', status: 'created' })
  const props = [{ name: 'Name', type: 'title', value: 'Kopi Kita' }, { name: 'Owed', type: 'number', value: '0.5' }]
  const row = await run('notion_add_row', { databaseId: 'db1', properties: props })
  assert.deepEqual(exec('NOTION_INSERT_ROW_DATABASE'), { database_id: 'db1', properties: props })
  assert.equal(row.status, 'created')
  // Read-only Notion types are refused by the schema (Mastra answers a schema failure instead of running the tool).
  const bad = await run('notion_add_row', { databaseId: 'db1', properties: [{ name: 'Sum', type: 'formula', value: '1' }] })
  assert.equal(bad.error, true)
  assert.equal(notionTitle({ title: [{ plain_text: 'Deals' }] }), 'Deals')
  assert.equal(notionText([{ type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'raw' } }] } }]), 'raw')
})

test('outlook: the same shapes as the Gmail tools; HTML bodies become text; drafts reply to the sender only', async () => {
  const list = await run('outlook_list_emails', { query: 'invoice', maxResults: 3 })
  assert.deepEqual(exec('OUTLOOK_LIST_MESSAGES'), { folder: 'inbox', top: 3, search: 'invoice' })
  assert.deepEqual(list, { source: 'outlook', emails: [{ id: 'AAMk1', from: 'Lumen Billing <billing@lumenhost.example>', subject: 'Invoice', snippet: 'Please pay by Friday', receivedAt: '2026-11-10T02:00:00Z', unread: true }] })
  const read = await run('outlook_read_email', { id: 'AAMk1' })
  assert.deepEqual(exec('OUTLOOK_GET_MESSAGE'), { message_id: 'AAMk1' })
  assert.deepEqual(read, { source: 'outlook', id: 'AAMk1', from: 'billing@lumenhost.example', to: 'Me <me@example.com>', subject: 'Invoice', body: 'Hello & welcome\nPay 0.02 NEAR', receivedAt: '2026-11-10T02:00:00Z' })
  const draft = await run('outlook_create_draft', { replyToId: 'AAMk1', body: 'Paid, thanks.' })
  assert.deepEqual(exec('OUTLOOK_CREATE_DRAFT_REPLY'), { message_id: 'AAMk1', comment: 'Paid, thanks.' })
  assert.deepEqual(draft, { source: 'outlook', draftId: 'draft9', to: 'billing@lumenhost.example', subject: 'RE: Invoice', body: 'Paid, thanks.', status: 'draft_only' })
  assert.equal(htmlText('<style>x{}</style>a&nbsp;b'), 'a b')
})

test('an app the owner has not connected answers "<App> is not connected" for that app only', async () => {
  const cases: [keyof typeof toolRegistry, unknown, string, RegExp][] = [
    ['googlesheets_read_range', { spreadsheetId: 'sh1' }, 'usr_nogooglesheets', /Google Sheets is not connected/],
    ['googledrive_find_files', { query: 'x' }, 'usr_nogoogledrive', /Google Drive is not connected/],
    ['googledocs_read_document', { id: 'd1' }, 'usr_nogoogledocs', /Google Docs is not connected/],
    ['slack_list_channels', {}, 'usr_noslack', /Slack is not connected/],
    ['notion_search', {}, 'usr_nonotion', /Notion is not connected/],
    ['outlook_list_emails', {}, 'usr_nooutlook', /Outlook is not connected/],
  ]
  for (const [tool, input, user, err] of cases) await assert.rejects(run(tool, input, ctx(user)), err, tool)
  // The same user still reaches the apps they did connect.
  assert.equal((await run('slack_list_channels', {}, ctx('usr_nonotion'))).source, 'slack')
  await assert.rejects(run('notion_search', {}, ctx()), /Notion is not connected/)
})

test('try-out runs never reach Composio: every app answers that it is not in the try-out', async () => {
  for (const t of [...READS, ...WRITES]) {
    const input = { googlesheets_append_row: { spreadsheetId: 's', sheet: 'a', values: ['x'] }, googlesheets_update_cells: { spreadsheetId: 's', range: 'a!A1', newValues: [['x']], oldValues: [['y']] }, googledocs_create_document: { title: 't', markdown: '' }, slack_send_message: { channel: 'c', text: 't' },
      notion_create_page: { parentId: 'p', title: 't' }, notion_add_row: { databaseId: 'd', properties: [{ name: 'n', type: 'title', value: 'v' }] }, googlesheets_read_range: { spreadsheetId: 's' },
      googledrive_find_files: { query: 'q' }, googledocs_read_document: { id: 'd' }, notion_read_page: { pageId: 'p' }, outlook_read_email: { id: 'i' }, outlook_create_draft: { replyToId: 'i', body: 'b' } } as Record<string, unknown>
    await assert.rejects(run(t, input[t] ?? {}, ctx('usr_demo', true)), /not available in the try-out/, t)
  }
  assert.equal(calls.length, 0)
})

test('app tools map to one App node per app', () => {
  assert.equal(nodeIdFor('m1', 'googlesheets_append_row', {}), 'app:googlesheets')
  assert.equal(nodeIdFor('m1', 'googledrive_find_files', {}), 'app:googledrive')
  assert.equal(nodeIdFor('m1', 'googledocs_read_document', {}), 'app:googledocs')
  assert.equal(nodeIdFor('m1', 'slack_send_message', {}), 'app:slack')
  assert.equal(nodeIdFor('m1', 'notion_add_row', {}), 'app:notion')
  assert.equal(nodeIdFor('m1', 'outlook_create_draft', {}), 'app:outlook')
})
