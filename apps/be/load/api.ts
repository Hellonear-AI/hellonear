// Short local load test of the backend's own overhead: the fake engine (no NEAR AI credit) and the local
// Postgres. Concurrent users chat (each run stores 47 events) and list their Minds; at the end every run
// must have all of its events stored. Each user also has a run paused for approval answered twice at once (the app and
// a Telegram button share `resumeRun`, #208): exactly one answer may resume it (7 events), the other gets 409. And each
// user writes to a third Mind through its own (fake) Telegram bot, at the same time: the reply streams into one message
// (#222), whose final text must be the whole reply, and the run must be stored as completely as an app chat.
// Never point this at a public endpoint.
// Run: bun run load   (env: VUS=10, DURATION_S=10)
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { ENGINE_KEY, engine } from '../test/fake-engine.ts'
import { fakeTelegram, telegramServer } from '../test/fake-telegram.ts'

const VUS = Number(process.env.VUS ?? 10)
const DURATION_S = Number(process.env.DURATION_S ?? 10)

await new Promise<void>((r) => engine.listen(0, r))
process.env.ENGINE_URL = `http://127.0.0.1:${(engine.address() as AddressInfo).port}`
process.env.ENGINE_API_KEY = ENGINE_KEY
process.env.DATABASE_URL ??= 'postgresql://hellonear:hellonear-dev-only@localhost:55432/hellonear'
process.env.SECRETS_MASTER_KEY ??= randomBytes(32).toString('base64')
await new Promise<void>((r) => telegramServer.listen(0, r))
process.env.TELEGRAM_API_URL = `http://127.0.0.1:${(telegramServer.address() as AddressInfo).port}`
process.env.TELEGRAM_WEBHOOK_BASE = 'https://load.hellonear.test'

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
  const second = await fetch(`${base}/v1/minds`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ templateId: 'payments-mind', name: 'Load approvals' }) })
  // A Mind with its own bot, linked to an owner chat (the one-time /start code from the connect answer).
  const third = await fetch(`${base}/v1/minds`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ templateId: 'general-assistant', name: 'Load Telegram' }) })
  const telegramMindId = (await third.json()).mind.id as string
  const botId = 100_000_000 + Math.floor(Math.random() * 800_000_000)
  const botToken = `${botId}:AAH${randomBytes(18).toString('hex')}`
  fakeTelegram.bots.set(botToken, { id: botId, username: `load_${botId}_bot` })
  const linked = await fetch(`${base}/v1/minds/${telegramMindId}/telegram`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ token: botToken }) })
  const code = String((await linked.json()).telegram?.linkUrl ?? '').split('start=')[1]
  const secret = fakeTelegram.of(botToken, 'setWebhook').at(-1)?.secret_token as string
  const chat = botId + 1
  let update = 0
  const say = (text: string) => fetch(`${base}/v1/telegram/${telegramMindId}/webhook`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify({ update_id: ++update, message: { message_id: update, text, chat: { id: chat, type: 'private', first_name: 'Load' }, from: { id: chat, is_bot: false } } }),
  })
  await (await say(`/start ${code}`)).arrayBuffer()
  // The webhook answers at once; the "Linked." message follows.
  for (let i = 0; i < 200 && !fakeTelegram.sent(botToken).length; i++) await new Promise((r) => setTimeout(r, 10))
  return { cookie, mindId: (await res.json()).mind.id as string, approvalsMindId: (await second.json()).mind.id as string, telegramMindId, token: botToken, say }
}

const latencies: Record<string, number[]> = { chat: [], list: [], approve: [], telegramFirstText: [], telegramFullReply: [] }
let errors = 0
let doubleAnswers = 0
let telegramWrong = 0
const FULL_REPLY = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// One owner message over Telegram, while the app traffic runs: waits for the bot's reply message to hold the full text.
async function telegramTurn(token: string, say: (text: string) => Promise<Response>) {
  const from = fakeTelegram.calls.length
  const t = performance.now()
  const res = await say('hi')
  await res.arrayBuffer()
  if (res.status !== 200) { errors++; return }
  let first: number | undefined
  for (let i = 0; i < 200; i++) {
    const send = fakeTelegram.calls.slice(from).find((c) => c.token === token && c.method === 'sendMessage')
    if (send) {
      first ??= performance.now() - t
      const id = fakeTelegram.calls.indexOf(send) + 1
      if (fakeTelegram.messages.get(id)?.text === FULL_REPLY) {
        latencies.telegramFirstText.push(first)
        latencies.telegramFullReply.push(performance.now() - t)
        return
      }
    }
    await sleep(10)
  }
  telegramWrong++
}
const until = Date.now() + DURATION_S * 1000

async function vu() {
  const { cookie, mindId, approvalsMindId, telegramMindId, token: botToken, say } = await user()
  const json = { cookie, 'content-type': 'application/json' }
  const telegram = (async () => { while (Date.now() < until) await telegramTurn(botToken, say) })()
  while (Date.now() < until) {
    // A run paused for approval, answered by two clients at once.
    const paused = await fetch(`${base}/v1/minds/${approvalsMindId}/chat`, { method: 'POST', headers: json, body: JSON.stringify({ message: 'pay the bill' }) })
    const runId = (await paused.text()).match(/"runId":"([^"]+)"/)?.[1]
    if (paused.status !== 200 || !runId) { errors++; continue }
    let t = performance.now()
    const answers = await Promise.all([0, 1].map(() => fetch(`${base}/v1/runs/${runId}/approve`, { method: 'POST', headers: json, body: JSON.stringify({ toolCallId: 'call_1' }) })))
    for (const a of answers) await a.arrayBuffer()
    if (answers.map((a) => a.status).sort().join(',') !== '200,409') doubleAnswers++
    latencies.approve.push(performance.now() - t)
    t = performance.now()
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
  await telegram
  return { mindId, approvalsMindId, telegramMindId }
}

const started = Date.now()
const vus = await Promise.all(Array.from({ length: VUS }, vu))
const minds = vus.flatMap((v) => [v.mindId, v.telegramMindId])
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
// Approval runs: paused (4 events), then resumed exactly once (3 more) and finished.
const [approvals] = await query<{ runs: number; wrong: number }>(
  `select count(*)::int as runs, count(*) filter (where n <> 7 or status <> 'finished')::int as wrong
   from (select r.id, r.status, count(e.seq) as n from runs r left join run_events e on e.run_id = r.id where r.mind_id = any($1) group by r.id) x`,
  [vus.map((v) => v.approvalsMindId)],
)
console.log(`errors: ${errors}; runs stored: ${check.runs}; runs missing events: ${check.incomplete}`)
console.log(`telegram: ${latencies.telegramFullReply.length} replies streamed; not ending with the full text: ${telegramWrong}`)
console.log(`approvals: ${approvals.runs} runs answered twice at once; not exactly one 200 + one 409: ${doubleAnswers}; runs resumed other than once: ${approvals.wrong}`)

// Clean up the load users (cascades to minds, runs, events, sessions).
await query(`delete from users where near_account_id like 'load-%'`)
server.close()
engine.close()
telegramServer.close()
await pool.end()
process.exit(errors || check.incomplete || doubleAnswers || approvals.wrong || telegramWrong || !latencies.telegramFullReply.length ? 1 : 0)
