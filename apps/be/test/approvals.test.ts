// Offline unit tests for the approval checks Telegram shows (#208), ported from the app's card.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approvalChecks, fixFirstLabel, type WalletView } from '../src/approvals.ts'

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
