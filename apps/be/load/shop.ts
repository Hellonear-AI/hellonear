// Short local load test of the paths the track work changed: the paid-data shop's price list and negotiation
// (`/internal/v1/shop/{item}?quotes=1` and `?seller=&offer=`, with the run's wallet token, as the engine calls them) and
// the payments CSV and Excel file (`GET /v1/minds/{id}/payments.csv` and `.xlsx`, each Mind holding 200 payments with their runs' events). Every
// answer must be 200 with the right shape: an offer is accepted or countered at the expected price, and the CSV has one
// line per payment. Fake engine and fake OutLayer, local Postgres. Never point this at a public endpoint.
// Run: bun run load:shop   (env: VUS=10, DURATION_S=10)
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { ENGINE_KEY, engine } from '../test/fake-engine.ts'
import { outlayerServer } from '../test/fake-outlayer.ts'

const VUS = Number(process.env.VUS ?? 10)
const DURATION_S = Number(process.env.DURATION_S ?? 10)
const PAYMENTS_PER_MIND = 200

await new Promise<void>((r) => engine.listen(0, r))
process.env.ENGINE_URL = `http://127.0.0.1:${(engine.address() as AddressInfo).port}`
process.env.ENGINE_API_KEY = ENGINE_KEY
await new Promise<void>((r) => outlayerServer.listen(0, r))
process.env.OUTLAYER_URL = `http://127.0.0.1:${(outlayerServer.address() as AddressInfo).port}`
process.env.NEAR_RPC_URL = `${process.env.OUTLAYER_URL}/rpc`
process.env.SHOP_PAY_TO = 'shop.testnet'
process.env.SHOP_SELLERS = 'shop.testnet:1,cheap.testnet:0.8:0.5,dear.testnet:1.3'
process.env.DATABASE_URL ??= 'postgresql://hellonear:hellonear-dev-only@localhost:55432/hellonear'
process.env.SECRETS_MASTER_KEY ??= randomBytes(32).toString('base64')

const { server } = await import('../src/server.ts')
const { migrate, pool, query } = await import('../src/db.ts')
const { newId, randomToken, sha256 } = await import('../src/crypto.ts')
const { issueWalletToken } = await import('../src/walletToken.ts')
await migrate()
await new Promise<void>((r) => server.listen(0, r))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

async function user() {
  const id = newId('usr')
  const token = randomToken()
  await query('insert into users (id, near_account_id) values ($1, $2)', [id, `loadshop-${id}.testnet`])
  await query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`, [sha256(token), id])
  const cookie = `hn_session=${token}`
  const headers = { cookie, 'content-type': 'application/json', origin: 'http://localhost:3000' }
  const mindId = (await (await fetch(`${base}/v1/minds`, { method: 'POST', headers, body: JSON.stringify({ templateId: 'payments-mind', name: 'Load shop' }) })).json()).mind.id as string
  const w = await fetch(`${base}/v1/minds/${mindId}/wallet`, { method: 'POST', headers, body: '{}' })
  if (w.status !== 201) throw new Error(`wallet: ${w.status} ${await w.text()}`)
  // Payments, each made by a run whose events say who approved it (half by the owner's card, half by a rule).
  const runId = `run_loadshop_${randomBytes(4).toString('hex')}`
  await query(`insert into runs (id, mind_id, status) values ($1, $2, 'finished')`, [runId, mindId])
  for (let i = 0; i < PAYMENTS_PER_MIND; i++) {
    const pay = newId('pay')
    await query(`insert into wallet_payments (id, mind_id, to_account, amount_yocto, status, tx_hash, message) values ($1, $2, 'shop.testnet', $3, $4, $5, $6)`,
      [pay, mindId, (10n ** 21n * BigInt(i + 1)).toString(), i % 5 ? 'sent' : 'policy_denied', i % 5 ? randomBytes(22).toString('hex') : null, i % 5 ? null : 'Payment, "over" the limit, refused'])
    const call = `c${i}`
    const seq = i * 2
    await query('insert into run_events (run_id, seq, type, payload, ts) values ($1, $2, $3, $4, now()), ($1, $5, $6, $7, now())', [runId, seq + 1,
      i % 2 ? 'tool.approval_required' : 'tool.called', i % 2 ? { toolCallId: call } : { toolCallId: call, approvedBy: 'rule' }, seq + 2, 'tool.result', { toolCallId: call, result: { paymentId: pay } }])
  }
  return { cookie, mindId, walletToken: issueWalletToken(id, mindId) }
}

const users = await Promise.all(Array.from({ length: VUS }, user))
const latencies: Record<string, number[]> = { quotes: [], offer: [], csv: [], xlsx: [] }
let errors = 0
const fail = (what: string) => { if (errors++ < 5) console.error(what) }
async function timed(name: string, f: () => Promise<boolean>) {
  const t = performance.now()
  try { if (!(await f())) fail(`${name}: wrong answer`) } catch (e) { fail(`${name}: ${e instanceof Error ? e.message : e}`) }
  latencies[name].push(performance.now() - t)
}
// cheap.testnet (s2): price 0.0008, floor 0.0004. Offers and the answers they must get.
const OFFERS: [string, string, string][] = [['0.0004', 'accepted', '0.0004'], ['0.0006', 'accepted', '0.0006'], ['0.0002', 'countered', '0.0005'], ['0.0001', 'countered', '0.00045'], ['0.01', 'accepted', '0.0008']]

const until = Date.now() + DURATION_S * 1000
const started = Date.now()
await Promise.all(users.map(async (u, n) => {
  const engineHeaders = { 'x-engine-key': ENGINE_KEY, 'x-wallet-token': u.walletToken }
  let i = n
  while (Date.now() < until) {
    i++
    await timed('quotes', async () => {
      const r = await fetch(`${base}/internal/v1/shop/gas-price?quotes=1`, { headers: engineHeaders })
      const b = await r.json()
      return r.status === 200 && b.quotes.length === 3 && b.quotes[0].seller === 's2'
    })
    const [offer, status, price] = OFFERS[i % OFFERS.length]
    await timed('offer', async () => {
      const r = await fetch(`${base}/internal/v1/shop/network-status?seller=s2&offer=${offer}`, { headers: engineHeaders })
      const b = await r.json()
      return r.status === 200 && b.status === status && b.priceNear === price && b.payTo === 'cheap.testnet'
    })
    if (i % 3 === 0) await timed('csv', async () => {
      const r = await fetch(`${base}/v1/minds/${u.mindId}/payments.csv`, { headers: { cookie: u.cookie } })
      const text = await r.text()
      const lines = text.trimEnd().split('\r\n')
      return r.status === 200 && lines.length === PAYMENTS_PER_MIND + 1 && lines.filter((l) => l.includes(',your rule,')).length === PAYMENTS_PER_MIND / 2
    })
    if (i % 3 === 1) await timed('xlsx', async () => {
      const r = await fetch(`${base}/v1/minds/${u.mindId}/payments.xlsx`, { headers: { cookie: u.cookie } })
      const buf = Buffer.from(await r.arrayBuffer())
      // A zip (PK) holding one row per payment plus the header.
      return r.status === 200 && buf.subarray(0, 2).toString() === 'PK' && (buf.toString('latin1').match(/<row r="/g)?.length ?? 0) === PAYMENTS_PER_MIND + 1
    })
  }
}))
const seconds = (Date.now() - started) / 1000
const pct = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]?.toFixed(1)
for (const [name, xs] of Object.entries(latencies)) {
  console.log(`${name}: ${xs.length} requests, ${(xs.length / seconds).toFixed(1)}/s, p50 ${pct(xs, 50)} ms, p95 ${pct(xs, 95)} ms, max ${pct(xs, 100)} ms`)
}
console.log(`VUs: ${VUS}, ${seconds.toFixed(1)} s; errors: ${errors}`)

await query(`delete from users where near_account_id like 'loadshop-%'`)
server.close()
engine.close()
outlayerServer.close()
await pool.end()
process.exit(errors || Object.values(latencies).some((xs) => !xs.length) ? 1 : 0)
