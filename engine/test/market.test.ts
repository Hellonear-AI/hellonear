// NEAR AI Agent Market tools against a fake market answering with recorded real answers (12 Nov). No network, LLM or
// database. Run: node --import tsx --test test/market.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { toolRegistry } from '../src/tools.ts'
import { NOT_HIRED } from '../src/market.ts'

const catalog = JSON.parse(readFileSync(new URL('./fixtures/market-catalog.json', import.meta.url), 'utf8'))
const recorded = JSON.parse(readFileSync(new URL('./fixtures/market-quote.json', import.meta.url), 'utf8'))
const AVAILABLE = '59587d7c-1a74-4455-8761-3ce24deba9ea'

const seen: { url: string; body: string; headers: Record<string, unknown> }[] = []
const market = createServer(async (req, res) => {
  let body = ''
  for await (const c of req) body += c
  seen.push({ url: req.url!, body, headers: req.headers })
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  const u = new URL(req.url!, 'http://x')
  if (u.pathname === '/v1/agents') return send(200, catalog)
  const plans = u.pathname.match(/^\/v1\/agents\/([0-9a-f-]+)\/pricing-plans$/)
  if (plans) return plans[1] === AVAILABLE ? send(200, recorded.pricingPlans) : send(200, [])
  // Agents live at /agent/<handle> here, standing in for <handle>.market.near.ai.
  const a2a = u.pathname.match(/^\/agent\/([a-z0-9-]+)\/a2a\/v1$/)
  if (a2a && req.method === 'POST') {
    if (a2a[1] === 'infinito-absoluto') return send(402, recorded.challenge402)
    if (a2a[1] === 'qadri-research') return send(200, recorded.unreachable)
    if (a2a[1] === 'busy-agent') return send(200, { jsonrpc: '2.0', id: 1, error: { code: -32004, message: 'not taking calls' } })
    if (a2a[1] === 'no-pay') return send(402, { x402Version: 2, accepts: [] })
    return send(404, { error: 'not_found', message: 'no published agent at this host' })
  }
  send(404, {})
})

before(async () => {
  await new Promise<void>((r) => market.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(market.address() as AddressInfo).port}`
  process.env.MARKET_URL = base
  process.env.MARKET_AGENT_URL = `${base}/agent/{handle}`
})
after(async () => { await new Promise<void>((r) => market.close(() => r())) })

const run = (tool: 'market_search' | 'market_quote', input: unknown) => toolRegistry[tool].execute!(input as any, {} as any) as Promise<any>
const quote = (handle: string, agentId = AVAILABLE) => run('market_quote', { handle, agentId, task: 'Coffee shop market size in Austin\nA one-page estimate.' })

test('market_search reads the public catalog and each agent\'s default price', async () => {
  const out = await run('market_search', { query: 'market research', category: 'research', limit: 3 })
  const search = new URL(seen.find((s) => s.url.startsWith('/v1/agents?'))!.url, 'http://x').searchParams
  assert.equal(search.get('q'), 'market research')
  assert.equal(search.get('category'), 'research')
  assert.equal(search.get('limit'), '3')
  assert.equal(out.count, 3)
  const first = out.agents[0]
  assert.equal(first.handle, 'infinito-absoluto')
  assert.equal(first.agentId, AVAILABLE)
  assert.equal(first.priceUsd, '15')
  assert.equal(first.availableNow, true)
  assert.equal(first.builderVerified, true)
  assert.ok(first.description.length <= 240)
  assert.equal(out.agents[1].availableNow, false)
  assert.equal(out.agents[1].priceUsd, null, 'no default plan read: price unknown, not zero')
})

test('market_quote turns the agent\'s 402 into a price in USDC and pays nothing', async () => {
  const out = await quote('infinito-absoluto')
  assert.equal(out.status, 'quoted')
  assert.deepEqual(out.price, { usdc: '15', network: 'near:mainnet', payTo: recorded.challenge402.accepts[0].payTo })
  assert.equal(out.windowSeconds, 86_400)
  assert.deepEqual(out.plan, { name: 'Verified research report', priceUsd: '15' })
  assert.equal(out.canPayHere, false)
  assert.equal(out.note, NOT_HIRED)
  const call = seen.filter((s) => s.url === '/agent/infinito-absoluto/a2a/v1').at(-1)!
  assert.equal(call.headers['x-payment'], undefined, 'never sends a payment header')
  const body = JSON.parse(call.body)
  assert.equal(body.method, 'SendMessage')
  assert.equal(body.params.message.parts[0].text, 'Coffee shop market size in Austin\nA one-page estimate.')
})

test('an agent that is offline, not taking calls, unknown or unpaid is a plain answer', async () => {
  assert.equal((await quote('qadri-research', '48a6fe10-d75e-43b6-bcb8-a8afb43cc402')).status, 'unavailable')
  assert.equal((await quote('busy-agent')).status, 'not_taking_calls')
  assert.equal((await quote('nobody-here')).status, 'not_found')
  assert.equal((await quote('no-pay')).status, 'no_payments')
})

test('a handle is a DNS label only, so it cannot point the call at another host; secrets never go out', async () => {
  const validate = (input: unknown) => toolRegistry.market_quote.inputSchema!['~standard'].validate(input) as any
  for (const handle of ['evil.com/x', 'a.b', 'localhost:4000', '-bad', 'UPPER', 'x'.repeat(64)]) {
    assert.ok((await validate({ handle, agentId: AVAILABLE, task: 'A task that is long enough' })).issues?.length, handle)
  }
  assert.ok((await validate({ handle: 'infinito-absoluto', agentId: 'not-an-id', task: 'A task that is long enough' })).issues?.length)
  const before = seen.length
  await assert.rejects(run('market_quote', { handle: 'infinito-absoluto', agentId: AVAILABLE, task: 'Use my key {{secrets.API}} please' }), /secrets/)
  assert.equal(seen.length, before, 'nothing was sent')
})
