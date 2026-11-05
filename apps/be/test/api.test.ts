// Integration tests: the backend against the local Postgres (docker compose) and a fake engine.
// NEP-413 signatures are real (near-api-js); only the RPC access-key lookup is faked.
// Run: bun run test   (needs `docker compose up -d postgres` from the repo root)
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { KeyPair, KeyPairSigner } from 'near-api-js'
import { ENGINE_KEY, engine, fake } from './fake-engine.ts'

await new Promise<void>((r) => engine.listen(0, r))
process.env.ENGINE_URL = `http://127.0.0.1:${(engine.address() as AddressInfo).port}`
process.env.ENGINE_API_KEY = ENGINE_KEY
process.env.DATABASE_URL ??= 'postgresql://hellonear:hellonear-dev-only@localhost:55432/hellonear'
process.env.SECRETS_MASTER_KEY = randomBytes(32).toString('base64')
process.env.FE_ORIGIN = 'http://localhost:3000'

const { server } = await import('../src/server.ts')
const { setProvider } = await import('../src/auth.ts')
const { migrate, pool, query } = await import('../src/db.ts')
const { config } = await import('../src/config.ts')

// Accounts the fake RPC knows: accountId -> { publicKey -> permission }.
const chain = new Map<string, Map<string, 'FullAccess' | { FunctionCall: object }>>()
setProvider({
  async viewAccessKey({ accountId, publicKey }: { accountId: string; publicKey: unknown }) {
    const permission = chain.get(accountId)?.get(String(publicKey))
    if (!permission) throw new Error('access key does not exist')
    return { permission, nonce: 0n, block_hash: '', block_height: 0 }
  },
} as never)

let base = ''
before(async () => {
  await migrate()
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  await new Promise<void>((r) => engine.close(() => r()))
  await pool.end()
})

type Client = { cookie: string; accountId: string; call: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response> }

function client(cookie = ''): Client['call'] {
  return (method, path, body, headers = {}) => fetch(base + path, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function sign(keyPair: KeyPair, accountId: string, nonce: string, overrides: { recipient?: string; message?: string } = {}) {
  const signed = await new KeyPairSigner(keyPair).signNep413Message(accountId, {
    message: overrides.message ?? config.authMessage,
    recipient: overrides.recipient ?? config.authRecipient,
    nonce: new Uint8Array(Buffer.from(nonce, 'base64')),
  })
  return Buffer.from(signed.signature).toString('base64')
}

async function newAccount(permission: 'FullAccess' | { FunctionCall: object } = 'FullAccess') {
  const keyPair = KeyPair.fromRandom('ed25519')
  const accountId = `t${randomBytes(6).toString('hex')}.testnet`
  chain.set(accountId, new Map([[keyPair.getPublicKey().toString(), permission]]))
  return { keyPair, accountId, publicKey: keyPair.getPublicKey().toString() }
}

async function signIn(): Promise<Client> {
  const { keyPair, accountId, publicKey } = await newAccount()
  const call = client()
  const { nonce } = await (await call('POST', '/v1/auth/challenge', {})).json()
  const res = await call('POST', '/v1/auth/login', { accountId, publicKey, nonce, signature: await sign(keyPair, accountId, nonce) })
  assert.equal(res.status, 200, await res.clone().text())
  const cookie = res.headers.get('set-cookie')!.split(';')[0]
  return { cookie, accountId, call: client(cookie) }
}

async function events(res: Response) {
  assert.equal(res.status, 200, await res.clone().text())
  assert.equal(res.headers.get('content-type'), 'text/event-stream')
  return (await res.text()).split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}

describe('auth (#8)', () => {
  test('health is public; everything else needs a session', async () => {
    const res = await client()('GET', '/v1/health')
    assert.deepEqual(await res.json(), { ok: true, engine: true })
    for (const [method, path] of [['GET', '/v1/me'], ['GET', '/v1/minds'], ['POST', '/v1/minds'], ['GET', '/v1/secrets']]) {
      assert.equal((await client()(method, path, method === 'POST' ? {} : undefined)).status, 401, `${method} ${path}`)
    }
    assert.equal((await client('hn_session=forged')('GET', '/v1/me')).status, 401)
  })

  test('login with a NEP-413 signature opens a session; logout closes it', async () => {
    const alice = await signIn()
    const me = await (await alice.call('GET', '/v1/me')).json()
    assert.equal(me.user.nearAccountId, alice.accountId)
    const [row] = await query('select token_hash from sessions where user_id = $1', [me.user.id])
    assert.ok(!alice.cookie.includes(row.token_hash), 'only the hash is stored')
    assert.equal((await alice.call('POST', '/v1/auth/logout', {})).status, 204)
    assert.equal((await alice.call('GET', '/v1/me')).status, 401)
  })

  test('the same account signs in again as the same user', async () => {
    const { keyPair, accountId, publicKey } = await newAccount()
    const ids = []
    for (let i = 0; i < 2; i++) {
      const { nonce } = await (await client()('POST', '/v1/auth/challenge', {})).json()
      const res = await client()('POST', '/v1/auth/login', { accountId, publicKey, nonce, signature: await sign(keyPair, accountId, nonce) })
      ids.push((await res.json()).user.id)
    }
    assert.equal(ids[0], ids[1])
  })

  test('replayed, expired, or unknown nonces; wrong recipient or message; foreign or function-call keys are refused', async () => {
    const call = client()
    const { keyPair, accountId, publicKey } = await newAccount()
    const challenge = async () => (await (await call('POST', '/v1/auth/challenge', {})).json()).nonce as string
    const login = async (body: Record<string, unknown>) => (await call('POST', '/v1/auth/login', { accountId, publicKey, ...body })).status

    const nonce = await challenge()
    const signature = await sign(keyPair, accountId, nonce)
    assert.equal(await login({ nonce, signature }), 200)
    assert.equal(await login({ nonce, signature }), 401, 'replay')

    const expired = await challenge()
    await query(`update auth_nonces set expires_at = now() - interval '1 second' where nonce = $1`, [expired])
    assert.equal(await login({ nonce: expired, signature: await sign(keyPair, accountId, expired) }), 401, 'expired')

    const made = randomBytes(32).toString('base64')
    assert.equal(await login({ nonce: made, signature: await sign(keyPair, accountId, made) }), 401, 'nonce not issued')

    const n1 = await challenge()
    assert.equal(await login({ nonce: n1, signature: await sign(keyPair, accountId, n1, { recipient: 'evil.app' }) }), 401, 'other recipient')
    const n2 = await challenge()
    assert.equal(await login({ nonce: n2, signature: await sign(keyPair, accountId, n2, { message: 'Send all funds' }) }), 401, 'other message')

    const mallory = await newAccount()
    const n3 = await challenge()
    assert.equal(await login({ nonce: n3, signature: await sign(mallory.keyPair, accountId, n3), publicKey: mallory.publicKey }), 401, 'key of another account')

    const fc = await newAccount({ FunctionCall: { receiver_id: 'x.testnet', method_names: [] } })
    const n4 = await challenge()
    const status = (await call('POST', '/v1/auth/login', { accountId: fc.accountId, publicKey: fc.publicKey, nonce: n4, signature: await sign(fc.keyPair, fc.accountId, n4) })).status
    assert.equal(status, 401, 'function-call key')
  })

  test('state-changing requests from another origin are refused; the web app origin gets CORS', async () => {
    const alice = await signIn()
    assert.equal((await alice.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'X' }, { origin: 'https://evil.example' })).status, 403)
    const res = await alice.call('GET', '/v1/me', undefined, { origin: 'http://localhost:3000' })
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000')
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true')
    assert.equal((await alice.call('GET', '/v1/me', undefined, { origin: 'https://evil.example' })).headers.get('access-control-allow-origin'), null)
  })
})

describe('minds (#8, #13)', () => {
  test('create from a template, customise, list, delete; another user cannot see it', async () => {
    const alice = await signIn()
    const created = await alice.call('POST', '/v1/minds', { templateId: 'payments-mind', name: 'Penny' })
    assert.equal(created.status, 201)
    const { mind } = await created.json()
    assert.match(mind.id, /^mnd_[a-f0-9]{24}$/)
    assert.deepEqual(mind.skills, ['payments', 'daily-planner'])
    assert.equal(mind.soul.identity, 'You pay bills.')

    const patched = await (await alice.call('PATCH', `/v1/minds/${mind.id}`, { name: 'Pen', skills: ['daily-planner'], soul: { identity: 'Careful.', invariants: ['No.'] } })).json()
    assert.equal(patched.mind.name, 'Pen')
    assert.deepEqual(patched.mind.skills, ['daily-planner'])
    assert.deepEqual(patched.mind.soul, { identity: 'Careful.', invariants: ['No.'], priors: [] })
    assert.deepEqual((await (await alice.call('GET', '/v1/minds')).json()).minds.map((m: any) => m.id), [mind.id])

    const bob = await signIn()
    for (const [method, sub] of [['GET', ''], ['PATCH', ''], ['DELETE', ''], ['POST', '/chat'], ['GET', '/runs'], ['GET', '/workflows']]) {
      const res = await bob.call(method, `/v1/minds/${mind.id}${sub}`, method === 'GET' || method === 'DELETE' ? undefined : { name: 'x', message: 'x' })
      assert.equal(res.status, 404, `${method} ${sub}`)
    }
    assert.equal((await alice.call('DELETE', `/v1/minds/${mind.id}`)).status, 204)
    assert.equal((await alice.call('GET', `/v1/minds/${mind.id}`)).status, 404)
  })

  test('unknown templates and skills, duplicates, and bad bodies are refused', async () => {
    const alice = await signIn()
    assert.equal((await alice.call('POST', '/v1/minds', { templateId: 'nope', name: 'X' })).status, 400)
    const bad = await alice.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'X', skills: ['rm-rf'] })
    assert.deepEqual(await bad.json(), { error: 'unknown_skill', skills: ['rm-rf'] })
    assert.equal((await alice.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'X', skills: ['payments', 'payments'] })).status, 400)
    assert.equal((await alice.call('POST', '/v1/minds', { templateId: 'general-assistant', name: '' })).status, 400)
    const notJson = await fetch(base + '/v1/minds', { method: 'POST', headers: { cookie: alice.cookie }, body: '{nope' })
    assert.deepEqual([notJson.status, await notJson.json()], [400, { error: 'invalid_json' }])
  })

  test('skills come from the engine catalog, so a skill no template offers can be equipped', async () => {
    const alice = await signIn()
    const catalog = await alice.call('GET', '/v1/skills')
    assert.equal(catalog.status, 200)
    assert.deepEqual((await catalog.json()).skills.map((s: any) => s.skillId), ['daily-planner', 'http-request', 'payments'])
    assert.equal((await fetch(base + '/v1/skills')).status, 401)
    const created = await alice.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'Builder', skills: ['daily-planner', 'http-request'] })
    assert.equal(created.status, 201)
    const mind = (await created.json()).mind
    assert.deepEqual(mind.skills.map((s: any) => s.skillId ?? s), ['daily-planner', 'http-request'])
    assert.equal((await alice.call('PATCH', `/v1/minds/${mind.id}`, { skills: ['http-request'] })).status, 200)
  })
})

describe('secrets (#18)', () => {
  test('values are encrypted at rest, never returned, and handed to the engine for a run', async () => {
    const alice = await signIn()
    const value = `sk-${randomBytes(8).toString('hex')}`
    const put = await alice.call('PUT', '/v1/secrets/SHOP_API_KEY', { value, allowedHosts: ['HTTPBIN.org'] })
    assert.equal(put.status, 200)
    const putText = await put.text()
    assert.ok(!putText.includes(value))
    assert.deepEqual(JSON.parse(putText).secret.allowedHosts, ['httpbin.org'])
    const listText = await (await alice.call('GET', '/v1/secrets')).text()
    assert.ok(!listText.includes(value))
    const [row] = await query('select ciphertext from secrets where name = $1 and ciphertext is not null order by created_at desc limit 1', ['SHOP_API_KEY'])
    assert.ok(!row.ciphertext.includes(value))

    const { mind } = await (await alice.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'Sam' })).json()
    await events(await alice.call('POST', `/v1/minds/${mind.id}/chat`, { message: 'hi' }))
    const sent = fake.requests.findLast((r) => r.path === `/v1/minds/${mind.id}/chat`)!
    assert.deepEqual(sent.body.secrets, [{ name: 'SHOP_API_KEY', value, allowedHosts: ['httpbin.org'] }])
    const stored = await query(`select count(*)::int as n from run_events e join runs r on r.id = e.run_id where r.mind_id = $1 and e.payload::text like $2`, [mind.id, `%${value}%`])
    assert.equal(stored[0].n, 0)

    // Another user gets none of Alice's secrets.
    const bob = await signIn()
    const bobMind = (await (await bob.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'B' })).json()).mind
    await events(await bob.call('POST', `/v1/minds/${bobMind.id}/chat`, { message: 'hi' }))
    assert.deepEqual(fake.requests.findLast((r) => r.path === `/v1/minds/${bobMind.id}/chat`)!.body.secrets, [])

    assert.equal((await alice.call('DELETE', '/v1/secrets/SHOP_API_KEY')).status, 204)
    assert.equal((await alice.call('DELETE', '/v1/secrets/SHOP_API_KEY')).status, 404)
  })

  test('bad names, hosts and values are refused', async () => {
    const alice = await signIn()
    assert.equal((await alice.call('PUT', '/v1/secrets/lower', { value: 'abcd', allowedHosts: ['a.com'] })).status, 400)
    for (const host of ['https://a.com', 'a.com/path', 'localhost', '', 'a.com:443']) {
      assert.equal((await alice.call('PUT', '/v1/secrets/K', { value: 'abcd', allowedHosts: [host] })).status, 400, host)
    }
    assert.equal((await alice.call('PUT', '/v1/secrets/K', { value: 'abcd', allowedHosts: [] })).status, 400)
    assert.equal((await alice.call('PUT', '/v1/secrets/K', { value: 'abc', allowedHosts: ['a.com'] })).status, 400)
  })
})

describe('chat and runs (#14, #17)', () => {
  test('events are relayed in order and stored; the run is summarised; threads continue', async () => {
    const alice = await signIn()
    const { mind } = await (await alice.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'Gina' })).json()
    const evs = await events(await alice.call('POST', `/v1/minds/${mind.id}/chat`, { message: 'what time is it?' }))
    assert.equal(evs[0].type, 'run.started')
    assert.deepEqual(evs.map((e) => e.seq), evs.map((_, i) => i))
    assert.equal(evs.at(-1).type, 'run.verified')
    const sent = fake.requests.findLast((r) => r.path === `/v1/minds/${mind.id}/chat`)!
    assert.deepEqual(sent.body.mind, { templateId: 'general-assistant', name: 'Gina', soul: { identity: 'You help.', invariants: ['Never invent facts.'], priors: [] }, model: 'z-ai/glm-5.3-flash', skills: [{ skillId: 'daily-planner' }] })

    const { run, events: stored } = await (await alice.call('GET', `/v1/runs/${evs[0].runId}`)).json()
    assert.deepEqual(stored, evs)
    assert.equal(run.status, 'finished')
    assert.equal(run.costUsd, 0.00042)

    const threadId = evs[0].threadId
    assert.match(threadId, /^thr_[a-f0-9]{24}$/)
    const again = await events(await alice.call('POST', `/v1/minds/${mind.id}/chat`, { threadId, message: 'and now?' }))
    assert.equal(again[0].threadId, threadId)
    const runs = (await (await alice.call('GET', `/v1/minds/${mind.id}/runs?threadId=${threadId}`)).json()).runs
    assert.equal(runs.length, 2)

    // The Mind Graph history leaves out deltas.
    const history = (await (await alice.call('GET', `/v1/minds/${mind.id}/events`)).json()).events
    assert.ok(history.length > 0 && history.every((e: any) => !e.type.endsWith('.delta')))
    assert.ok(history.some((e: any) => e.nodeId === 'tool:get_time'))
  })

  test('a thread of another Mind, or one never started, cannot be used', async () => {
    const alice = await signIn()
    const a = (await (await alice.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'A' })).json()).mind
    const b = (await (await alice.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'B' })).json()).mind
    const threadId = (await events(await alice.call('POST', `/v1/minds/${a.id}/chat`, { message: 'hi' })))[0].threadId
    assert.equal((await alice.call('POST', `/v1/minds/${b.id}/chat`, { threadId, message: 'hi' })).status, 404)
    assert.equal((await alice.call('POST', `/v1/minds/${a.id}/chat`, { threadId: `thr_${'0'.repeat(24)}`, message: 'hi' })).status, 404)
    const bob = await signIn()
    assert.equal((await bob.call('GET', `/v1/runs/${(await (await alice.call('GET', `/v1/minds/${a.id}/runs`)).json()).runs[0].runId}`)).status, 404)
  })

  test('engine 4xx answers reach the browser as they are', async () => {
    const alice = await signIn()
    const { mind } = await (await alice.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'E' })).json()
    const res = await alice.call('POST', `/v1/minds/${mind.id}/chat`, { message: 'not allowed' })
    assert.deepEqual([res.status, await res.json()], [400, { error: 'invalid_body', issues: [{ message: 'nope' }] }])
  })

  test('the whole run is stored even if the browser leaves mid-stream', async () => {
    const alice = await signIn()
    const { mind } = await (await alice.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'S' })).json()
    const controller = new AbortController()
    const res = await fetch(`${base}/v1/minds/${mind.id}/chat`, {
      method: 'POST', headers: { cookie: alice.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'slow' }), signal: controller.signal,
    })
    const reader = res.body!.getReader()
    await reader.read()
    controller.abort()
    // 27 events (7 + 20 deltas) at 20 ms each; wait until the last one, run.verified, is stored.
    const stored = () => query<{ n: number; last: boolean }>(
      `select count(*)::int as n, bool_or(e.type = 'run.verified') as last from run_events e join runs r on r.id = e.run_id where r.mind_id = $1`, [mind.id])
    for (let i = 0; i < 60 && !(await stored())[0].last; i++) await new Promise((r) => setTimeout(r, 50))
    assert.equal((await stored())[0].n, 27)
  })

  test('approval inbox: a paused wallet action waits; approve continues the run with continuous seq', async () => {
    const alice = await signIn()
    const { mind } = await (await alice.call('POST', '/v1/minds', { templateId: 'payments-mind', name: 'P' })).json()
    const paused = await events(await alice.call('POST', `/v1/minds/${mind.id}/chat`, { message: 'pay the bill' }))
    const runId = paused[0].runId
    assert.equal((await (await alice.call('GET', `/v1/runs/${runId}`)).json()).run.status, 'awaiting_approval')
    const inbox = (await (await alice.call('GET', `/v1/minds/${mind.id}/approvals`)).json()).approvals
    assert.deepEqual(inbox.map((a: any) => [a.runId, a.toolCallId, a.tool]), [[runId, 'call_1', 'pay_invoice']])

    assert.equal((await alice.call('POST', `/v1/runs/${runId}/approve`, { toolCallId: 'call_other' })).status, 409)
    const bob = await signIn()
    assert.equal((await bob.call('POST', `/v1/runs/${runId}/approve`, { toolCallId: 'call_1' })).status, 404)

    const resumed = await events(await alice.call('POST', `/v1/runs/${runId}/approve`, { toolCallId: 'call_1' }))
    assert.equal(resumed[0].seq, paused.length)
    const resumeReq = fake.requests.findLast((r) => r.path.startsWith(`/v1/runs/${runId}/approve`))!
    assert.equal(resumeReq.path, `/v1/runs/${runId}/approve?mindId=${mind.id}`)
    assert.equal(resumeReq.body.threadId, paused[0].threadId)
    const { run, events: all } = await (await alice.call('GET', `/v1/runs/${runId}`)).json()
    assert.equal(run.status, 'finished')
    assert.deepEqual(all.map((e: any) => e.seq), all.map((_: unknown, i: number) => i))
    assert.deepEqual((await (await alice.call('GET', `/v1/minds/${mind.id}/approvals`)).json()).approvals, [])
    assert.equal((await alice.call('POST', `/v1/runs/${runId}/approve`, { toolCallId: 'call_1' })).status, 409, 'not twice')
  })

  test('a resume after an engine restart (seq from 0) is stored after the paused events', async () => {
    const alice = await signIn()
    const { mind } = await (await alice.call('POST', '/v1/minds', { templateId: 'payments-mind', name: 'R' })).json()
    const paused = await events(await alice.call('POST', `/v1/minds/${mind.id}/chat`, { message: 'pay it' }))
    fake.restartBeforeResume = true
    try {
      const resumed = await events(await alice.call('POST', `/v1/runs/${paused[0].runId}/decline`, { toolCallId: 'call_1', reason: 'too much' }))
      assert.equal(resumed[0].seq, paused.length)
      assert.equal(resumed[0].type, 'tool.error')
    } finally {
      fake.restartBeforeResume = false
    }
    const { events: all } = await (await alice.call('GET', `/v1/runs/${paused[0].runId}`)).json()
    assert.deepEqual(all.map((e: any) => e.seq), all.map((_: unknown, i: number) => i))
    assert.equal(all.length, paused.length + 3)
  })
})

describe('workflows and Autopilot (#20, #21)', () => {
  const canvas = { name: 'Low balance', nodes: [{ id: 'start', type: 'trigger' }], edges: [] }

  test('canvases are proxied; runs are relayed and stored; Mind changes reach Autopilot', async () => {
    const alice = await signIn()
    const { mind } = await (await alice.call('POST', '/v1/minds', { templateId: 'payments-mind', name: 'W' })).json()
    assert.equal((await alice.call('PUT', `/v1/minds/${mind.id}/workflows/low-balance`, canvas)).status, 200)
    assert.deepEqual((await alice.call('PUT', `/v1/minds/${mind.id}/workflows/low-balance`, {})).status, 400)
    assert.equal((await alice.call('PUT', `/v1/minds/${mind.id}/workflows/Bad_Id`, canvas)).status, 400)
    assert.deepEqual((await (await alice.call('GET', `/v1/minds/${mind.id}/workflows`)).json()).workflows.map((w: any) => w.workflowId), ['low-balance'])

    const evs = await events(await alice.call('POST', `/v1/minds/${mind.id}/workflows/low-balance/runs`, { input: { account: 'a.testnet' } }))
    assert.equal(evs[0].type, 'workflow.started')
    const { run } = await (await alice.call('GET', `/v1/runs/${evs[0].runId}`)).json()
    assert.deepEqual([run.workflowId, run.status], ['low-balance', 'success'])

    const ap = await alice.call('PUT', `/v1/minds/${mind.id}/workflows/low-balance/autopilot`, { input: { account: 'a.testnet' } })
    assert.equal((await ap.json()).autopilot.status, 'active')
    const key = `${mind.id}/low-balance`
    assert.equal(fake.autopilots.get(key).mind.name, 'W')

    // Renaming the Mind sends the new config to every Autopilot workflow, with the stored input.
    const patched = await (await alice.call('PATCH', `/v1/minds/${mind.id}`, { name: 'Walt' })).json()
    assert.deepEqual(patched.autopilot.map((a: any) => [a.workflowId, a.status]), [['low-balance', 200]])
    assert.equal(fake.autopilots.get(key).mind.name, 'Walt')
    assert.deepEqual(fake.autopilots.get(key).input, { account: 'a.testnet' })

    // A change the schedule cannot run with is reported (the engine paused it).
    const broken = await (await alice.call('PATCH', `/v1/minds/${mind.id}`, { skills: [] })).json()
    assert.deepEqual(broken.autopilot.map((a: any) => [a.status, a.issues[0].code]), [[409, 'missing_tools']])

    // Deleting the Mind deletes its workflows (and their schedules) in the engine.
    assert.equal((await alice.call('DELETE', `/v1/minds/${mind.id}`)).status, 204)
    assert.equal(fake.workflows.has(key), false)
    assert.equal(fake.autopilots.has(key), false)
  })
})
