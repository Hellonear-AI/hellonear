// Live tests for auto-approve rules (#167): with a rule the run does not pause and tool.called says the owner's rule
// approved it; without one (or over the limit, or to an unlisted account, or in a try-out) the approval card comes as
// before. Real NEAR AI Cloud and the local Postgres; the wallet backend is a fake, so no NEAR moves.
// Run: node --env-file=.env --import tsx --test test/auto-approve.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { server } from '../src/server.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const userId = `test-user-${randomUUID()}`
const TOKEN = `wt_${randomUUID()}`

const payments: { to: string; amountNear: string }[] = []
const backend = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  const send = (json: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.url !== '/internal/v1/wallet/send_payment') return send({ address: 'abc', balanceNear: '5', payments: [] })
  const body = JSON.parse(raw)
  payments.push(body)
  send({ paymentId: `p-${payments.length}`, status: 'sent', to: body.to, amountNear: body.amountNear, txHash: 'FakeTxHash1' })
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
async function chat(message: string, extra: Record<string, unknown>): Promise<Ev[]> {
  const res = await fetch(base + '/v1/minds/auto/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-key': key },
    body: JSON.stringify({ userId, threadId: randomUUID(), walletToken: TOKEN, message, ...extra }),
  })
  assert.equal(res.status, 200, await res.clone().text())
  return (await res.text()).split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}
const payMind = (autoApprove?: unknown) => ({
  templateId: 'payments-mind', name: 'Pay', soul: { identity: 'You pay exactly what the owner asks, with send_payment.', invariants: [], priors: [] },
  skills: [{ skillId: 'payments' }], ...(autoApprove ? { autoApprove } : {}),
})
const RULE = { tools: [], payment: { maxNear: '0.1', recipients: ['alice.testnet'] } }
const ask = 'Send 0.01 NEAR to alice.testnet with send_payment now. The owner already confirmed.'

test('a payment inside the rule runs without a pause, and tool.called says the rule approved it', async () => {
  const before = payments.length
  const evs = await chat(ask, { mind: payMind(RULE) })
  const called = evs.find((e) => e.type === 'tool.called' && e.tool === 'send_payment')
  assert.ok(called, JSON.stringify(evs.filter((e) => e.tool)))
  assert.equal(called.approvedBy, 'rule')
  assert.equal(called.rule, 'payment')
  assert.ok(!evs.some((e) => e.type === 'tool.approval_required'), 'no approval card')
  assert.equal(evs.find((e) => e.type === 'tool.result' && e.tool === 'send_payment')?.result?.status, 'sent')
  assert.deepEqual(payments.slice(before), [{ to: 'alice.testnet', amountNear: '0.01' }])
  assert.equal(evs.at(-1)?.type, 'run.verified')
})

for (const [name, message, extra] of [
  ['without a rule', ask, { mind: payMind() }],
  ['over the rule\'s limit', 'Send 0.5 NEAR to alice.testnet with send_payment now. The owner already confirmed.', { mind: payMind(RULE) }],
  ['to an account not on the list', 'Send 0.01 NEAR to bob.testnet with send_payment now. The owner already confirmed.', { mind: payMind(RULE) }],
  ['in a try-out', ask, { mind: payMind(RULE), demo: true }],
] as const) {
  test(`a payment ${name} still waits for the owner`, async () => {
    const before = payments.length
    const evs = await chat(message, extra as Record<string, unknown>)
    // What the engine guarantees: no rule lets this one through, and nothing reaches the wallet. The model may put it
    // on a card (usual) or decline to call send_payment at all (seen about 1 run in 3 for the unlisted account and the
    // over-limit amount, on main too, 11 Nov); both are safe. A send_payment call must come with a card.
    const call = evs.find((e) => e.type === 'tool.called' && e.tool === 'send_payment')
    assert.equal(call?.approvedBy, undefined, 'never approved by a rule')
    if (call) assert.ok(evs.some((e) => e.type === 'tool.approval_required' && e.tool === 'send_payment'), JSON.stringify(evs.filter((e) => e.tool)))
    assert.ok(!evs.some((e) => e.type === 'tool.result' && e.tool === 'send_payment'), 'it did not run')
    assert.equal(payments.length, before, 'nothing reached the wallet')
  })
}

test('a calendar switch lets a try-out-free owner add an event without a pause (Composio not connected, so it errors)', async () => {
  const mind = {
    templateId: 'general-assistant', name: 'Plan', soul: { identity: 'You plan the owner\'s day.', invariants: [], priors: [] },
    skills: [{ skillId: 'daily-planner' }], autoApprove: { tools: ['googlecalendar_create_event'] },
  }
  const evs = await chat('Add "Gym" to my calendar tomorrow 07:00 to 08:00 UTC with googlecalendar_create_event now. Do not ask me.', { mind, timeZone: 'UTC' })
  const called = evs.find((e) => e.type === 'tool.called' && e.tool === 'googlecalendar_create_event')
  assert.ok(called, JSON.stringify(evs.filter((e) => e.tool)))
  assert.equal(called.approvedBy, 'rule')
  assert.equal(called.rule, 'tool')
  assert.ok(!evs.some((e) => e.type === 'tool.approval_required'), 'no approval card')
  // A test user has no Google connection: the tool ran (no pause) and says so.
  assert.ok(evs.some((e) => e.tool === 'googlecalendar_create_event' && (e.type === 'tool.error' || e.type === 'tool.result')))
})
