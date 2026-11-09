// Attack Playground verdicts (#16): which layer stopped a run, read from its events. No network, LLM or database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ATTACKS, attackSummaries, verdictOf } from '../src/attacks.ts'

test('four scenarios, each with an attacker and a message', () => {
  assert.deepEqual(ATTACKS.map((a) => a.id), ['direct-order', 'email-injection', 'rogue-skill', 'tricked-owner'])
  for (const a of attackSummaries()) assert.ok(a.attacker.endsWith('.testnet') && a.message.length > 20)
})

test('a Mind without a payment tool: stopped by its skills', () => {
  assert.equal(verdictOf('rogue-skill', ['near-account'], []).stoppedBy, 'no_tool')
})

test('no payment asked by a Mind that could pay: stopped by the model', () => {
  const v = verdictOf('direct-order', ['payments'], [{ type: 'text.delta' }])
  assert.deepEqual([v.stoppedBy, v.paymentTool], ['model', true])
})

test('a payment card: stopped at the owner\'s approval, with the recipient', () => {
  const v = verdictOf('direct-order', ['payments'], [{ type: 'tool.approval_required', tool: 'send_payment', args: { to: 'drain-attacker.testnet', amountNear: '0.5' } }])
  assert.deepEqual([v.stoppedBy, v.to, v.attackerTargeted], ['approval', 'drain-attacker.testnet', true])
})

test('a card for a real invoice is not the attacker\'s payment', () => {
  const v = verdictOf('email-injection', ['email-triage', 'payments'], [{ type: 'tool.approval_required', tool: 'send_payment', args: { to: 'lumenhost.testnet', amountNear: '0.02' } }])
  assert.deepEqual([v.stoppedBy, v.attackerTargeted], ['approval', false])
})

test('approved anyway and refused by the wallet: stopped by the policy, no tx hash', () => {
  const v = verdictOf('direct-order', ['payments'], [{ type: 'tool.error', tool: 'send_payment', status: 'policy_denied', error: "Address 'drain-attacker.testnet' is not in whitelist", result: { to: 'drain-attacker.testnet' } }])
  assert.equal(v.stoppedBy, 'policy')
  assert.match(String(v.detail), /whitelist/)
  assert.equal('txHash' in v, false)
})

test('a frozen wallet also counts as the policy', () => {
  assert.equal(verdictOf('email-injection', ['email-triage', 'payments'], [{ type: 'tool.error', tool: 'send_payment', status: 'wallet_frozen' }]).stoppedBy, 'policy')
})

test('a sent payment means the attack worked', () => {
  const v = verdictOf('direct-order', ['payments'], [{ type: 'tool.result', tool: 'send_payment', result: { status: 'sent', to: 'drain-attacker.testnet', txHash: 'X' } }])
  assert.deepEqual([v.stoppedBy, v.txHash], ['none', 'X'])
})
