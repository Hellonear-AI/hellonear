// The status page's data, end to end: real probes against fake upstreams (some up, one slow, one failing), stored in
// the local Postgres, and served by GET /v1/status. Run: bun run test (needs `docker compose up -d postgres`).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'

const ENGINE_KEY = 'status-test-engine-key'
let engineUp = true
const seenEngineKeys: string[] = []

// One fake per upstream, each a tiny server; `slow` answers after 3.2 s (OutLayer's degraded threshold is 3 s).
function fake(handle: (req: IncomingMessage, body: string) => { status: number; body?: unknown; delayMs?: number }): Server {
  return createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const out = handle(req, raw)
      setTimeout(() => res.writeHead(out.status, { 'content-type': 'application/json' }).end(out.body === undefined ? '' : JSON.stringify(out.body)), out.delayMs ?? 0)
    })
  })
}

const engine = fake((req) => {
  seenEngineKeys.push(String(req.headers['x-engine-key'] ?? ''))
  if (!engineUp) return { status: 503, body: { error: 'down' } }
  if (req.url === '/v1/health') return { status: 200, body: { ok: true } }
  if (req.url === '/internal/v1/probes') {
    return { status: 200, body: { probes: [
      { id: 'nearai-chat', status: 'operational', latencyMs: 812, detail: null },
      { id: 'nearai-embeddings', status: 'down', latencyMs: null, detail: 'No answer in 15 s.' },
      { id: 'something-else', status: 'down', latencyMs: 1, detail: 'ignored' },
    ] } }
  }
  return { status: 404 }
})
let quoteBody: any
const oneClick = fake((req, body) => {
  quoteBody = JSON.parse(body || '{}')
  return req.url === '/v0/quote' ? { status: 200, body: { quote: { amountOut: '9990000' } } } : { status: 404 }
})
const outlayer = fake((req) => (req.url === '/health' ? { status: 200, body: { ok: true }, delayMs: 3200 } : { status: 404 }))
const rpc = fake(() => ({ status: 200, body: { jsonrpc: '2.0', id: 'status', result: { sync_info: { syncing: false } } } }))
const market = fake(() => ({ status: 500, body: { error: 'boom' } }))
const tee = fake((req) => ({ status: req.method === 'HEAD' ? 200 : 405 }))

const servers = [engine, oneClick, outlayer, rpc, market, tee]
for (const s of servers) await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
const url = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`

process.env.ENGINE_URL = url(engine)
process.env.ENGINE_API_KEY = ENGINE_KEY
process.env.OUTLAYER_URL = url(outlayer)
process.env.STATUS_ONECLICK_URL = url(oneClick)
process.env.STATUS_NEAR_RPC_URL = url(rpc)
process.env.STATUS_MARKET_URL = url(market)
process.env.TEE_EXPLORER_URL = url(tee)
process.env.DATABASE_URL ??= 'postgresql://hellonear:hellonear-dev-only@localhost:55432/hellonear'
process.env.SECRETS_MASTER_KEY = randomBytes(32).toString('base64')

const { server } = await import('../src/server.ts')
const { migrate, pool, query } = await import('../src/db.ts')
const { runProbes, resetStatusCache, SERVICES } = await import('../src/status.ts')

let base = ''
before(async () => {
  await migrate()
  await query('delete from service_checks')
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = url(server)
})
after(async () => {
  for (const s of [server, ...servers]) { s.closeAllConnections(); s.close() }
  await pool.end()
})

const ORDER = ['hellonear-api', 'hellonear-engine', 'nearai-chat', 'nearai-embeddings', 'near-intents-quote', 'outlayer', 'near-rpc', 'agent-market', 'tee-explorer']

test('one round: every service checked at once, one failing never stops the others, statuses as expected', async () => {
  const results = await runProbes()
  const by = Object.fromEntries(results.map((r) => [r.service, r]))
  assert.deepEqual(Object.keys(by).sort(), [...ORDER].sort(), 'one result per service, the engine\'s extra probe dropped')
  assert.equal(by['hellonear-api'].status, 'operational')
  assert.equal(by['hellonear-engine'].status, 'operational')
  assert.equal(by['nearai-chat'].status, 'operational')
  assert.deepEqual([by['nearai-embeddings'].status, by['nearai-embeddings'].detail], ['down', 'No answer in 15 s.'])
  assert.equal(by['near-intents-quote'].status, 'operational')
  assert.equal(by['outlayer'].status, 'degraded', 'answered after 3.2 s, over its 3 s threshold')
  assert.match(String(by['outlayer'].detail), /^Slow: answered in 3\.\d s\.$/)
  assert.equal(by['near-rpc'].status, 'operational')
  assert.deepEqual([by['agent-market'].status, by['agent-market'].detail], ['down', 'Answered HTTP 500.'])
  assert.equal(by['tee-explorer'].status, 'operational')
  assert.ok(seenEngineKeys.every((k) => k === ENGINE_KEY), 'the engine is called with its key')
  assert.equal(quoteBody.dry, true, 'the 1Click check is a dry quote: nothing can move')
  const rows = await query<{ n: string }>('select count(*) as n from service_checks')
  assert.equal(Number(rows[0].n), ORDER.length)
})

test('GET /v1/status: the exact shape, public CORS, cache header, order and the stored statuses', async () => {
  resetStatusCache()
  const res = await fetch(`${base}/v1/status`, { headers: { origin: 'https://status.hellonear.xyz' } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
  assert.equal(res.headers.get('access-control-allow-credentials'), null, 'no credentials on a public route')
  assert.equal(res.headers.get('cache-control'), 'public, max-age=30')
  assert.match(String(res.headers.get('content-type')), /^application\/json/)
  const body = await res.json()
  assert.deepEqual(Object.keys(body).sort(), ['incidents', 'overall', 'services', 'updatedAt'])
  assert.ok(!Number.isNaN(Date.parse(body.updatedAt)))
  assert.equal(body.overall, 'degraded', 'partners and NEAR AI trouble, but HelloNear itself is up')
  assert.deepEqual(body.services.map((s: { id: string }) => s.id), ORDER)
  for (const s of body.services) {
    assert.deepEqual(Object.keys(s).sort(), ['checkedAt', 'detail', 'group', 'history', 'id', 'impact', 'latencyMs', 'name', 'status', 'uptime24h', 'uptime7d'])
    assert.ok(['HelloNear', 'NEAR AI', 'NEAR', 'Partners'].includes(s.group))
    assert.ok(s.impact.length > 10 && s.name.length > 2)
    assert.equal(s.history.length, 48)
    for (const h of s.history) {
      assert.deepEqual(Object.keys(h).sort(), ['bad', 'checks', 'detail', 'start', 'status'])
      assert.ok(['operational', 'degraded', 'down', 'none'].includes(h.status) && !Number.isNaN(Date.parse(h.start)))
      assert.ok(h.bad <= h.checks && (h.status !== 'none' || h.checks === 0))
    }
    assert.notEqual(s.history.at(-1).status, 'none', 'the current half hour holds the check just made')
  }
  const by = Object.fromEntries(body.services.map((s: { id: string }) => [s.id, s]))
  assert.deepEqual([by['agent-market'].status, by['agent-market'].uptime24h, by['agent-market'].history.at(-1).status], ['down', 0, 'down'])
  assert.deepEqual(by['agent-market'].history.at(-1), { start: by['agent-market'].history.at(-1).start, status: 'down', checks: 1, bad: 1, detail: 'Answered HTTP 500.' })
  assert.deepEqual(by['tee-explorer'].history.at(-1), { start: by['tee-explorer'].history.at(-1).start, status: 'operational', checks: 1, bad: 0, detail: null })
  // Every non-operational service is one ongoing incident; operational ones have none.
  assert.deepEqual(body.incidents.map((i: { service: string }) => i.service).sort(), ['agent-market', 'nearai-embeddings', 'outlayer'])
  const market = body.incidents.find((i: { service: string }) => i.service === 'agent-market')
  assert.deepEqual(Object.keys(market).sort(), ['detail', 'end', 'minutes', 'name', 'service', 'start', 'status'])
  assert.deepEqual([market.name, market.status, market.end, market.minutes, market.detail], ['NEAR AI Agent Market', 'down', null, 0, 'Answered HTTP 500.'])
  assert.equal(body.incidents.find((i: { service: string }) => i.service === 'outlayer').status, 'degraded')
  assert.deepEqual([by['outlayer'].status, by['outlayer'].uptime24h], ['degraded', 100])
  assert.deepEqual([by['nearai-chat'].status, by['nearai-chat'].latencyMs], ['operational', 812])
  assert.equal(by['hellonear-api'].group, 'HelloNear')
  assert.deepEqual(SERVICES.map((s) => s.id), ORDER)
  const text = JSON.stringify(body)
  assert.ok(!text.includes(ENGINE_KEY) && !text.includes('127.0.0.1'), 'no key and no upstream URL in the answer')
})

test('OPTIONS is answered for any origin; other methods are refused; the app routes keep their own CORS', async () => {
  const pre = await fetch(`${base}/v1/status`, { method: 'OPTIONS', headers: { origin: 'https://status.hellonear.xyz', 'access-control-request-method': 'GET' } })
  assert.equal(pre.status, 204)
  assert.equal(pre.headers.get('access-control-allow-origin'), '*')
  const post = await fetch(`${base}/v1/status`, { method: 'POST', headers: { origin: 'https://status.hellonear.xyz' } })
  assert.equal(post.status, 405)
  const health = await fetch(`${base}/v1/health`, { headers: { origin: 'https://status.hellonear.xyz' } })
  assert.equal(health.headers.get('access-control-allow-origin'), null, 'other routes still allow the web app only')
})

test('engine down: the engine check is down, NEAR AI is not guessed (nothing stored for it this round)', async () => {
  engineUp = false
  try {
    await query('delete from service_checks')
    const results = await runProbes()
    const by = Object.fromEntries(results.map((r) => [r.service, r]))
    assert.equal(by['hellonear-engine'].status, 'down')
    assert.equal(by['nearai-chat'], undefined)
    assert.equal(by['nearai-embeddings'], undefined)
    assert.equal(by['near-intents-quote'].status, 'operational', 'the rest still ran')
    resetStatusCache()
    const body = await (await fetch(`${base}/v1/status`)).json()
    const s = Object.fromEntries(body.services.map((x: { id: string }) => [x.id, x]))
    assert.equal(body.overall, 'down', 'HelloNear\'s own engine is down')
    assert.deepEqual([s['nearai-chat'].status, s['nearai-chat'].checkedAt], ['unknown', null])
  } finally {
    engineUp = true
  }
})

test('the answer is cached about 30 s, and a new round clears the cache', async () => {
  resetStatusCache()
  const first = await (await fetch(`${base}/v1/status`)).json()
  await query(`insert into service_checks (service, status, latency_ms, detail) values ('tee-explorer', 'down', null, 'test row')`)
  const cachedBody = await (await fetch(`${base}/v1/status`)).json()
  assert.equal(cachedBody.updatedAt, first.updatedAt, 'served from the cache')
  await runProbes()
  const fresh = await (await fetch(`${base}/v1/status`)).json()
  assert.notEqual(fresh.updatedAt, first.updatedAt, 'a probe round drops the cached answer')
})

test('rows older than 8 days are deleted by a round', async () => {
  await query(`insert into service_checks (service, checked_at, status) values ('outlayer', now() - interval '9 days', 'down')`)
  await runProbes()
  const old = await query<{ n: string }>(`select count(*) as n from service_checks where checked_at < now() - interval '8 days'`)
  assert.equal(Number(old[0].n), 0)
})
