// Prompt tests for the cross-chain quote (NEAR Intents 1Click, dry run) in the payments skill, against real NEAR AI
// Cloud and the local Postgres. A fake backend stands in for the wallet routes and a fake 1Click answers like the live
// API did on 12 Nov, so no test depends on market makers. Run: node --env-file=.env --import tsx --test test/skills-crosschain.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { server } from '../src/server.ts'
import { resetTokenCache } from '../src/crosschain.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const TOKEN = `wt_${randomUUID()}`
const BASE_ADDR = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'
const SOL_ADDR = '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV'

type Ev = Record<string, any>
async function chat(message: string, threadId = randomUUID()): Promise<Ev[]> {
  const res = await fetch(`${base}/v1/minds/penny/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-key': key },
    body: JSON.stringify({ userId: `usr_cc_${randomUUID().slice(0, 8)}`, threadId, walletToken: TOKEN, message, mind }),
  })
  assert.equal(res.status, 200, await res.clone().text())
  return (await res.text()).split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}
// The Payments Mind template's skills plus calendar and mail ones: with only `payments` equipped the model always
// called the tool, but a try-out Mind with ~20 skills answered from the skill list alone (Chrome, 12 Nov).
const SKILLS = ['payments', 'daily-planner', 'recipient-guard', 'split-bill', 'treasury-report', 'spending-audit', 'best-price', 'freeze-advisor', 'calendar-conflicts', 'email-triage', 'phishing-detector', 'subscriptions', 'invoice', 'near-account']
const mind = { templateId: 'payments-mind', name: 'Penny', soul: { identity: 'You handle the owner\'s payments carefully.', invariants: ['Never invent facts.'], priors: [] }, skills: SKILLS.map((skillId) => ({ skillId })) }
const reply = (evs: Ev[]) => evs.filter((e) => e.type === 'run.finished').map((e) => e.text ?? '').join('\n')
const calls = (evs: Ev[], tool: string) => evs.filter((e) => e.type === 'tool.called' && e.tool === tool)

const TOKENS = [
  { assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6, blockchain: 'near', symbol: 'USDC' },
  { assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6, blockchain: 'base', symbol: 'USDC' },
  { assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', decimals: 6, blockchain: 'sol', symbol: 'USDC' },
  { assetId: 'nep141:usdt.tether-token.near', decimals: 6, blockchain: 'near', symbol: 'USDT' },
  { assetId: 'nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near', decimals: 6, blockchain: 'sol', symbol: 'USDT' },
]
const quotes: any[] = []
const oneClick = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.url === '/v0/tokens') return send(200, TOKENS)
  const body = JSON.parse(raw)
  quotes.push(body)
  const out = (BigInt(body.amount) * 99956n) / 100000n
  send(201, { quote: { amountIn: body.amount, amountOut: out.toString(), minAmountOut: ((out * 99n) / 100n).toString(), timeEstimate: 22 }, correlationId: randomUUID(), timestamp: new Date().toISOString() })
})
let sends = 0
const backend = createServer(async (req, res) => {
  for await (const _ of req) void _
  const send = (json: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.headers['x-wallet-token'] !== TOKEN) return res.writeHead(401).end('{}')
  if (req.url === '/internal/v1/wallet/balance') return send({ address: 'a'.repeat(64), balanceNear: '0.42' })
  if (req.url?.startsWith('/internal/v1/wallet/payments')) return send({ payments: [] })
  if (req.url === '/internal/v1/wallet/send_payment') { sends++; return send({ paymentId: 'p1', status: 'sent', txHash: 'FakeTx1' }) }
  res.writeHead(404).end('{}')
})

before(async () => {
  await new Promise<void>((r) => oneClick.listen(0, '127.0.0.1', r))
  await new Promise<void>((r) => backend.listen(0, '127.0.0.1', r))
  process.env.ONECLICK_URL = `http://127.0.0.1:${(oneClick.address() as AddressInfo).port}`
  process.env.BACKEND_URL = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`
  resetTokenCache()
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(async () => {
  await new Promise<void>((r) => oneClick.close(() => r()))
  await new Promise<void>((r) => backend.close(() => r()))
  await new Promise<void>((r) => server.close(() => r()))
})

test('"send 10 USDC to <Base address>": a dry quote with the owner\'s address, no payment card, says nothing was sent', async () => {
  const evs = await chat(`Send 10 USDC to ${BASE_ADDR} on Base.`)
  const q = calls(evs, 'crosschain_quote')
  assert.equal(q.length, 1, JSON.stringify(evs.filter((e) => e.type === 'tool.called').map((e) => [e.tool, e.args])))
  assert.deepEqual({ ...q[0].args, toChain: String(q[0].args.toChain).toLowerCase() }, { token: 'USDC', amount: '10', toChain: 'base', recipient: BASE_ADDR })
  assert.equal(quotes.at(-1).dry, true)
  assert.ok(!evs.some((e) => e.type === 'tool.approval_required'), 'no approval card for a quote')
  assert.equal(sends, 0)
  const text = reply(evs)
  assert.match(text, /9\.99/, text)
  assert.match(text, /(not|nothing).{0,40}(sent|send)|can'?t send|cannot send|preview|quote/i, text)
})

test('USDT on Solana: the token and chain follow the owner\'s words', async () => {
  const evs = await chat(`I want to pay 25 USDT to ${SOL_ADDR} on Solana. How much would they get?`)
  const q = calls(evs, 'crosschain_quote')
  assert.equal(q.length, 1, JSON.stringify(evs.filter((e) => e.type === 'tool.called').map((e) => [e.tool, e.args])))
  assert.equal(q[0].args.token, 'USDT')
  assert.equal(q[0].args.amount, '25')
  assert.match(String(q[0].args.toChain), /^sol(ana)?$/i)
  assert.equal(q[0].args.recipient, SOL_ADDR)
  assert.equal(sends, 0)
})

test('a NEAR testnet payment still goes through send_payment with its approval card', async () => {
  const evs = await chat('Pay 0.01 NEAR to alice.testnet.')
  assert.equal(calls(evs, 'crosschain_quote').length, 0)
  assert.ok(evs.some((e) => e.type === 'tool.approval_required' && e.tool === 'send_payment'), JSON.stringify(evs.filter((e) => e.type === 'tool.called').map((e) => e.tool)))
})
