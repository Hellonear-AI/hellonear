// Offline unit tests for the approval checks Telegram shows (#208), ported from the app's card.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addNear, approvalChecks, approvalDetails, clip, fixFirstLabel, refusalReasons, subNear, type WalletView } from '../src/approvals.ts'

const wallet = (over: Partial<WalletView> = {}): WalletView => ({ balanceNear: '1', frozen: false, policy: { perTransactionNear: '0.05', whitelist: ['shop.testnet'] }, ...over })
const pay = (amountNear: string, to = 'shop.testnet') => ({ to, amountNear })

test('enough balance and within the policy: Approve', () => {
  assert.deepEqual(approvalChecks(pay('0.01'), wallet()), {
    next: 'approve',
    checks: [{ ok: true, text: 'Within your 0.05 NEAR limit' }, { ok: true, text: 'On your list of addresses' }, { ok: true, text: 'Enough balance: 1.00 NEAR' }],
  })
  // Exactly the balance is enough.
  assert.equal(approvalChecks(pay('0.01'), wallet({ balanceNear: '0.01' })).next, 'approve')
})

test('a balance below the payment, or an unfunded wallet read as 0, asks to fund it first (#228)', () => {
  const short = approvalChecks(pay('0.01'), wallet({ balanceNear: '0.009999999999999999999999' }))
  assert.equal(short.next, 'fund')
  assert.deepEqual(short.checks.at(-1), { ok: false, text: 'Not enough balance: 0.00 NEAR' })
  assert.equal(approvalChecks(pay('0.01'), wallet({ balanceNear: '0' })).next, 'fund')
  assert.equal(approvalChecks(pay('0.01'), wallet({ balanceNear: '0', policy: null })).next, 'fund')
  assert.equal(fixFirstLabel('fund'), "Add NEAR to this Mind's wallet first")
})

test('order of reasons: frozen, then the limit, then the list, then the balance', () => {
  const empty = { balanceNear: '0' }
  assert.equal(approvalChecks(pay('0.5', 'stranger.testnet'), wallet({ ...empty, frozen: true })).next, 'unfreeze')
  assert.equal(approvalChecks(pay('0.5', 'stranger.testnet'), wallet(empty)).next, 'change_limits')
  assert.equal(approvalChecks(pay('0.01', 'stranger.testnet'), wallet(empty)).next, 'add_address')
  assert.equal(approvalChecks(pay('0.01'), wallet(empty)).next, 'fund')
})

test('no wallet read, or a balance that is not a plain decimal: no checks to block on, the TEE still decides', () => {
  assert.deepEqual(approvalChecks(pay('0.01'), null), { checks: [], next: 'approve' })
  assert.equal(approvalChecks(pay('0.01'), wallet({ balanceNear: 'n/a' })).next, 'approve')
})

test('the daily cap (#149): spent today + this payment over the cap blocks it, exactly on the cap is fine', () => {
  const capped = (spentTodayNear: string) => wallet({ spentTodayNear, policy: { perTransactionNear: '0.5', dailyNear: '0.6', whitelist: ['shop.testnet'] } })
  assert.deepEqual(approvalChecks(pay('0.2'), capped('0.4')), {
    next: 'approve',
    checks: [{ ok: true, text: 'Within your 0.5 NEAR limit' }, { ok: true, text: "Within today's 0.6 NEAR limit" }, { ok: true, text: 'On your list of addresses' }, { ok: true, text: 'Enough balance: 1.00 NEAR' }],
  })
  const over = approvalChecks(pay('0.3'), capped('0.4'))
  assert.equal(over.next, 'change_limits')
  assert.deepEqual(over.checks[1], { ok: false, text: "Over today's 0.6 NEAR limit (0.20 left): blocked even if you approve" })
  // Over by one yoctoNEAR still counts; nothing left reads 0.00.
  assert.equal(approvalChecks(pay('0.200000000000000000000001'), capped('0.4')).next, 'change_limits')
  assert.deepEqual(approvalChecks(pay('0.01'), capped('0.6')).checks[1], { ok: false, text: "Over today's 0.6 NEAR limit (0.00 left): blocked even if you approve" })
  // Frozen still comes first; the cap comes before the list and the balance.
  assert.equal(approvalChecks(pay('0.3', 'stranger.testnet'), { ...capped('0.4'), frozen: true }).next, 'unfreeze')
  assert.equal(approvalChecks(pay('0.3', 'stranger.testnet'), { ...capped('0.4'), balanceNear: '0' }).next, 'change_limits')
})

test('no daily cap, no counter, or a value that is not a plain decimal: no daily check', () => {
  assert.equal(approvalChecks(pay('0.01'), wallet({ spentTodayNear: '0.04' })).checks.length, 3)
  assert.equal(approvalChecks(pay('0.01'), wallet({ policy: { perTransactionNear: '0.05', dailyNear: '0.1', whitelist: ['shop.testnet'] } })).checks.length, 3)
  assert.equal(approvalChecks(pay('0.01'), wallet({ spentTodayNear: 'n/a', policy: { perTransactionNear: '0.05', dailyNear: '0.1', whitelist: ['shop.testnet'] } })).next, 'approve')
})

test('a refused payment names the daily cap when it broke it', () => {
  const w = wallet({ spentTodayNear: '0.4', policy: { perTransactionNear: '0.5', dailyNear: '0.6', whitelist: ['shop.testnet'] } })
  assert.deepEqual(refusalReasons(pay('0.3'), w), ["Over today's 0.6 NEAR limit"])
  assert.deepEqual(refusalReasons(pay('0.7', 'stranger.testnet'), w), ['Not on your list of addresses', 'Over 0.5 NEAR per payment', "Over today's 0.6 NEAR limit"])
  assert.deepEqual(refusalReasons(pay('0.2'), w), [])
  assert.deepEqual(refusalReasons(pay('0.2'), null), [])
})

test('addNear and subNear are exact to the yoctoNEAR', () => {
  assert.equal(addNear('0.1', '0.2'), '0.3')
  assert.equal(addNear('1', '0.000000000000000000000001'), '1.000000000000000000000001')
  assert.equal(subNear('0.6', '0.4'), '0.2')
  assert.equal(subNear('0.4', '0.6'), '0')
  assert.equal(subNear('2', '2'), '0')
})

test('every approval tool the app details also has details on Telegram, in the same words', () => {
  assert.deepEqual(approvalDetails('slack_send_message', { channel: 'general', text: 'Standup moved to 10:00' }), {
    title: 'Post to #general', lines: [{ label: 'Message', value: 'Standup moved to 10:00' }], note: 'Posted to Slack as you.',
  })
  assert.equal(approvalDetails('slack_send_message', { channel: '#ops', text: 'x' })!.title, 'Post to #ops')
  assert.deepEqual(approvalDetails('googlesheets_update_cells', { range: 'Invoices!D3', newValues: [['Paid']], oldValues: [['Unpaid']] }), {
    title: 'Change Invoices!D3 in your Google Sheet',
    lines: [{ label: 'Now', value: 'Unpaid' }, { label: 'New', value: 'Paid' }],
    note: 'Changes only these cells. "Now" is what the Mind read; if the cells hold something else when you approve, nothing is changed.',
  })
  assert.deepEqual(approvalDetails('googlesheets_update_cells', { range: 'A!B2:C2', newValues: [['x', 2]], oldValues: [['', null]] })!.lines[0], { label: 'Now', value: '(empty), (empty)' })
  assert.deepEqual(approvalDetails('googlesheets_append_row', { sheet: 'Expenses', values: ['2026-11-11', 12.5, null, 'Hosting'] })!.lines, [{ label: 'Row', value: '2026-11-11, 12.5, , Hosting' }])
  assert.equal(approvalDetails('googledocs_create_document', { title: 'Treasury', markdown: 'a'.repeat(1234) })!.lines[0].value, '1,234 characters')
  assert.equal(approvalDetails('notion_create_page', { title: 'Notes' })!.lines[0].value, 'Empty page')
  const row = approvalDetails('notion_add_row', { databaseId: 'db', properties: Array.from({ length: 10 }, (_, i) => ({ name: `P${i}`, type: 'rich_text', value: `v${i}` })) })!
  assert.equal(row.lines.length, 8)
  assert.deepEqual(row.lines[0], { label: 'P0', value: 'v0' })
  assert.equal(approvalDetails('mail_send_to_owner', { subject: 'Today', text: 'hello' })!.title, 'Email you "Today"')
  assert.deepEqual(approvalDetails('sell_offer', { title: 'Weather data', priceNear: '0.01', item: 'Forecast for Jakarta' }), {
    title: 'Sell "Weather data" for 0.01 NEAR', lines: [{ label: 'Item', value: 'Forecast for Jakarta' }], note: "Other Minds can buy it; they pay into this Mind's own wallet.",
  })
  assert.equal(approvalDetails('unknown_tool', {}), null)
})

test('long values are cut so a card stays under Telegram\'s 4096 characters', () => {
  assert.equal(clip('short'), 'short')
  const long = approvalDetails('slack_send_message', { channel: 'general', text: 'y'.repeat(4000) })!.lines[0].value
  assert.ok(long.length < 1600)
  assert.match(long, /… \(4,000 characters, the rest in the app\)$/)
  const notion = approvalDetails('notion_add_row', { properties: Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, value: 'z'.repeat(2000) })) })!
  assert.ok(notion.lines.reduce((n, l) => n + l.label.length + l.value.length + 2, 0) < 3600)
})
