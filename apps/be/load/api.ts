// Short local load test of the backend's own overhead: the fake engine (no NEAR AI credit) and the local
// Postgres. Concurrent users chat (each run stores 47 events) and list their Minds; at the end every run
// must have all of its events stored. Never point this at a public endpoint.
// Run: bun run load   (env: VUS=10, DURATION_S=10)
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { ENGINE_KEY, engine } from '../test/fake-engine.ts'

const VUS = Number(process.env.VUS ?? 10)
const DURATION_S = Number(process.env.DURATION_S ?? 10)

await new Promise<void>((r) => engine.listen(0, r))
process.env.ENGINE_URL = `http://127.0.0.1:${(engine.address() as AddressInfo).port}`
process.env.ENGINE_API_KEY = ENGINE_KEY
process.env.DATABASE_URL ??= 'postgresql://hellonear:hellonear-dev-only@localhost:55432/hellonear'
process.env.SECRETS_MASTER_KEY ??= randomBytes(32).toString('base64')

const { server } = await import('../src/server.ts')
const { migrate, pool, query } = await import('../src/db.ts')
const { newId, randomToken, sha256 } = await import('../src/crypto.ts')
await migrate()
await new Promise<void>((r) => server.listen(0, r))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

// Sessions are created directly (login is covered by the integration tests and needs a wallet).
async function user() {
  const id = newId('usr')
  const token = randomToken()
  await query('insert into users (id, near_account_id) values ($1, $2)', [id, `load-${id}.testnet`])
  await query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`, [sha256(token), id])
  const cookie = `hn_session=${token}`
  const res = await fetch(`${base}/v1/minds`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ templateId: 'general-assistant', name: 'Load' }) })
  return { cookie, mindId: (await res.json()).mind.id as string }
}

const latencies: Record<string, number[]> = { chat: [], list: [] }
let errors = 0
const until = Date.now() + DURATION_S * 1000

async function vu() {
  const { cookie, mindId } = await user()
  while (Date.now() < until) {
    let t = performance.now()
    const chat = await fetch(`${base}/v1/minds/${mindId}/chat`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) })
    const text = await chat.text()
    if (chat.status !== 200 || !text.includes('run.verified')) errors++
    latencies.chat.push(performance.now() - t)
    t = performance.now()
    const list = await fetch(`${base}/v1/minds`, { headers: { cookie } })
    if (list.status !== 200) errors++
    await list.arrayBuffer()
    latencies.list.push(performance.now() - t)
  }
  return mindId
}

const started = Date.now()
const minds = await Promise.all(Array.from({ length: VUS }, vu))
const seconds = (Date.now() - started) / 1000

const pct = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]?.toFixed(1)
for (const [name, xs] of Object.entries(latencies)) {
  console.log(`${name}: ${xs.length} requests, ${(xs.length / seconds).toFixed(1)}/s, p50 ${pct(xs, 50)} ms, p95 ${pct(xs, 95)} ms, max ${pct(xs, 100)} ms`)
}
const [check] = await query<{ runs: number; incomplete: number }>(
  `select count(*)::int as runs, count(*) filter (where n <> 47)::int as incomplete
   from (select r.id, count(e.seq) as n from runs r left join run_events e on e.run_id = r.id where r.mind_id = any($1) group by r.id) x`,
  [minds],
)
console.log(`errors: ${errors}; runs stored: ${check.runs}; runs missing events: ${check.incomplete}`)

// Clean up the load users (cascades to minds, runs, events, sessions).
await query(`delete from users where near_account_id like 'load-%'`)
server.close()
engine.close()
await pool.end()
process.exit(errors || check.incomplete ? 1 : 0)
