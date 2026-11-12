// Prompt tests for Hire on Agent Market and Best price buyer's one-round haggle, against real NEAR AI Cloud and the
// local Postgres. A fake market answers with the answers recorded from market.near.ai on 12 Nov, and a fake backend
// stands in for the wallet and shop routes. Run: node --env-file=.env --import tsx --test test/skills-market-negotiation.test.ts
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { server } from '../src/server.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const TOKEN = `wt_${randomUUID()}`
type Ev = Record<string, any>

async function chat(mind: unknown, message: string, threadId = randomUUID(), userId = `usr_mk_${randomUUID().slice(0, 8)}`): Promise<Ev[]> {
  const res = await fetch(`${base}/v1/minds/mk/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-key': key },
    body: JSON.stringify({ userId, threadId, walletToken: TOKEN, message, mind }),
  })
  assert.equal(res.status, 200, await res.clone().text())
  return (await res.text()).split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}
const reply = (evs: Ev[]) => evs.filter((e) => e.type === 'run.finished').map((e) => e.text ?? '').join('\n')
const calls = (evs: Ev[], tool: string) => evs.filter((e) => e.type === 'tool.called' && e.tool === tool)
const toolsOf = (evs: Ev[]) => JSON.stringify(evs.filter((e) => e.type === 'tool.called').map((e) => [e.tool, e.args]))
const mindWith = (templateId: string, skills: string[]) => ({ templateId, name: 'Mika', soul: { identity: 'You are a careful helper.', invariants: ['Never invent facts.'], priors: [] }, skills: skills.map((skillId) => ({ skillId })) })

const catalog = JSON.parse(readFileSync(new URL('./fixtures/market-catalog.json', import.meta.url), 'utf8'))
const recorded = JSON.parse(readFileSync(new URL('./fixtures/market-quote.json', import.meta.url), 'utf8'))
const a2aBodies: string[] = []
const market = createServer(async (req, res) => {
  let body = ''
  for await (const c of req) body += c
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  const u = new URL(req.url!, 'http://x')
  if (u.pathname === '/v1/agents') return send(200, catalog)
  if (/^\/v1\/agents\/[0-9a-f-]+\/pricing-plans$/.test(u.pathname)) return send(200, u.pathname.includes('59587d7c') ? recorded.pricingPlans : [])
  const a2a = u.pathname.match(/^\/agent\/([a-z0-9-]+)\/a2a\/v1$/)
  if (a2a) {
    a2aBodies.push(body)
    return a2a[1] === 'infinito-absoluto' ? send(402, recorded.challenge402) : send(200, recorded.unreachable)
  }
  send(404, {})
})

// The shop: s1 asks 0.001 and is on the wallet's list; s3 asks 0.0013. s1 takes any offer of 0.0009 or more and
// otherwise counters at 0.0009.
const offers: string[] = []
const backend = createServer(async (req, res) => {
  for await (const _ of req) void _
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.headers['x-wallet-token'] !== TOKEN) return send(401, {})
  const u = new URL(req.url!, 'http://x')
  if (u.pathname === '/internal/v1/wallet/balance') return send(200, { address: 'mika.testnet', balanceNear: '1' })
  if (u.pathname.startsWith('/internal/v1/wallet/payments')) return send(200, { payments: [] })
  if (u.pathname === '/internal/v1/shop/gas-price') {
    const q = u.searchParams
    if (q.get('quotes') === '1') return send(200, { title: 'Gas price', quotes: [
      { seller: 's1', payTo: 'shop.testnet', priceNear: '0.001', onYourList: true }, { seller: 's3', payTo: 'dear.testnet', priceNear: '0.0013', onYourList: true }] })
    const offer = q.get('offer')
    if (offer && !q.get('tx')) {
      offers.push(`${q.get('seller')}:${offer}`)
      if (q.get('seller') !== 's1') return send(400, { error: 'offer_not_taken' })
      return Number(offer) >= 0.0009
        ? send(200, { status: 'accepted', seller: 's1', priceNear: offer, payTo: 'shop.testnet', reason: 'deal' })
        : send(200, { status: 'countered', seller: 's1', priceNear: '0.0009', payTo: 'shop.testnet', reason: 'my last price' })
    }
    return send(402, { status: 'payment_required', title: 'Gas price', seller: q.get('seller') ?? 's1', priceNear: q.get('seller') === 's3' ? '0.0013' : '0.001', payTo: q.get('seller') === 's3' ? 'dear.testnet' : 'shop.testnet' })
  }
  send(404, { error: 'not_found' })
})

before(async () => {
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await new Promise<void>((r) => market.listen(0, '127.0.0.1', r))
  await new Promise<void>((r) => backend.listen(0, '127.0.0.1', r))
  const m = `http://127.0.0.1:${(market.address() as AddressInfo).port}`
  process.env.MARKET_URL = m
  process.env.MARKET_AGENT_URL = `${m}/agent/{handle}`
  process.env.BACKEND_URL = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`
})
after(async () => {
  await new Promise<void>((r) => backend.close(() => r()))
  await new Promise<void>((r) => market.close(() => r()))
  await new Promise<void>((r) => server.close(() => r()))
})

describe('Hire on Agent Market (General Assistant template)', () => {
  const mind = mindWith('general-assistant', ['daily-planner', 'calendar-conflicts', 'health-journal', 'redact-before-send', 'agent-market'])
  const threadId = randomUUID()
  const userId = `usr_mk_${randomUUID().slice(0, 8)}`

  test('finds agents and lists them with price and track record', async () => {
    const evs = await chat(mind, 'Find me an agent on the NEAR AI Agent Market that can do market research.', threadId, userId)
    assert.ok(calls(evs, 'market_search').length > 0, toolsOf(evs))
    const text = reply(evs)
    assert.match(text, /Infinito Absoluto/i, text)
    assert.match(text, /15/, `shows the price: ${text}`)
    assert.ok(!calls(evs, 'send_payment').length)
  })

  test('quotes a job the owner wrote, and says nothing was paid and hiring needs mainnet USDC', async () => {
    const evs = await chat(mind, 'Ask Infinito Absoluto for a price on this job: "Coffee shop market in Austin. A one-page estimate of the coffee shop market size in Austin, Texas."', threadId, userId)
    const q = calls(evs, 'market_quote')
    assert.ok(q.length > 0, toolsOf(evs))
    assert.equal(q[0].args.handle, 'infinito-absoluto')
    assert.match(q[0].args.task, /coffee/i)
    const text = reply(evs)
    assert.match(text, /15/, text)
    assert.match(text, /mainnet/i, text)
    assert.match(text, /(not|nothing|no)\b[^.]*\b(paid|sent|hired)|(didn't|did not|haven't|have not)\b[^.]*\b(pay|hire|send)/i, text)
    assert.ok(!/\b(I|we) (have )?(hired|booked|paid)\b/i.test(text), `never claims a hire: ${text}`)
  })
})

describe('Best price buyer haggles once (Payments Mind)', () => {
  const mind = mindWith('payments-mind', ['payments', 'daily-planner', 'recipient-guard', 'split-bill', 'treasury-report', 'spending-audit', 'best-price', 'freeze-advisor'])
  const card = (evs: Ev[]) => evs.find((e) => e.type === 'tool.approval_required')

  test('a budget under the counter: one offer, then it walks away and pays nothing', async () => {
    offers.length = 0
    const evs = await chat(mind, 'Buy the NEAR testnet gas price report from the cheapest seller. My budget is 0.0007 NEAR.')
    assert.ok(calls(evs, 'make_offer').length === 1, `exactly one offer: ${toolsOf(evs)}`)
    assert.deepEqual(offers, ['s1:0.0007'])
    assert.equal(card(evs), undefined, `no payment card: ${toolsOf(evs)}`)
    assert.match(reply(evs), /0\.0009/, reply(evs))
  })

  test('an accepted offer is bought at the agreed price, after the owner\'s approval', async () => {
    offers.length = 0
    const evs = await chat(mind, 'Buy the NEAR testnet gas price report from the cheapest seller. My budget is 0.00095 NEAR.')
    assert.equal(calls(evs, 'make_offer').length, 1, toolsOf(evs))
    assert.equal(offers[0], 's1:0.00095', toolsOf(evs))
    const ask = card(evs)
    assert.ok(ask, `a payment card: ${toolsOf(evs)} ${reply(evs)}`)
    assert.equal(ask.tool, 'send_payment')
    assert.equal(ask.args?.to, 'shop.testnet')
    assert.equal(ask.args?.amountNear, '0.00095')
  })

  test('no budget: no haggling, the card is at the quoted price', async () => {
    offers.length = 0
    const evs = await chat(mind, 'Buy the NEAR testnet gas price report from the cheapest seller.')
    assert.equal(calls(evs, 'make_offer').length, 0, toolsOf(evs))
    const ask = card(evs)
    assert.ok(ask, toolsOf(evs))
    assert.equal(ask.args?.amountNear, '0.001')
  })
})
