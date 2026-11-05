// Integration tests: the backend against the local Postgres (docker compose) and a fake engine.
// NEP-413 signatures are real (near-api-js); only the RPC access-key lookup is faked.
// Run: bun run test   (needs `docker compose up -d postgres` from the repo root)
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { KeyPair, KeyPairSigner } from 'near-api-js'
import { ENGINE_KEY, engine, fake } from './fake-engine.ts'
import { fakeOutlayer, outlayerServer } from './fake-outlayer.ts'
import { COMPOSIO_KEY, composioServer, fakeComposio } from './fake-composio.ts'

await new Promise<void>((r) => engine.listen(0, r))
process.env.ENGINE_URL = `http://127.0.0.1:${(engine.address() as AddressInfo).port}`
process.env.ENGINE_API_KEY = ENGINE_KEY
await new Promise<void>((r) => outlayerServer.listen(0, r))
process.env.OUTLAYER_URL = `http://127.0.0.1:${(outlayerServer.address() as AddressInfo).port}`
process.env.NEAR_RPC_URL = `${process.env.OUTLAYER_URL}/rpc`
const demoWallet = fakeOutlayer.addWallet()
process.env.DEMO_MODE = 'true'
process.env.DEMO_OUTLAYER_API_KEY = demoWallet.key
await new Promise<void>((r) => composioServer.listen(0, r))
process.env.COMPOSIO_URL = `http://127.0.0.1:${(composioServer.address() as AddressInfo).port}`
process.env.COMPOSIO_API_KEY = COMPOSIO_KEY
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
  await new Promise<void>((r) => outlayerServer.close(() => r()))
  await new Promise<void>((r) => composioServer.close(() => r()))
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

describe('Mind wallets (#14, #15)', () => {
  const origin = { origin: 'http://localhost:3000' }
  async function mindOf(c: Client) {
    const res = await c.call('POST', '/v1/minds', { templateId: 'payments-mind', name: `Pay ${randomBytes(3).toString('hex')}` }, origin)
    assert.equal(res.status, 201, await res.clone().text())
    return (await res.json()).mind.id as string
  }

  test('create: the key is stored encrypted and never returned; one wallet per Mind; owner only', async () => {
    const a = await signIn()
    const mindId = await mindOf(a)
    let res = await a.call('GET', `/v1/minds/${mindId}/wallet`)
    assert.equal(res.status, 404)
    assert.equal((await res.json()).error, 'no_wallet')

    res = await a.call('POST', `/v1/minds/${mindId}/wallet`, {}, origin)
    assert.equal(res.status, 201, await res.clone().text())
    const text = await res.text()
    const { wallet } = JSON.parse(text)
    assert.match(wallet.address, /^[0-9a-f]{64}$/)
    assert.deepEqual({ ...wallet, address: 'x' }, { address: 'x', shared: false, balanceNear: '0', frozen: false, policy: null })
    const w = fakeOutlayer.byAccount(wallet.address)
    assert.ok(!text.includes(w.key) && !text.includes('wk_') && !text.includes('handoff'))
    const [row] = await query('select key_ciphertext from mind_wallets where mind_id = $1', [mindId])
    assert.ok(!row.key_ciphertext.includes(w.key.slice(3)))

    res = await a.call('POST', `/v1/minds/${mindId}/wallet`, {}, origin)
    assert.equal(res.status, 409)
    const b = await signIn()
    for (const [method, path] of [['GET', '/wallet'], ['POST', '/wallet/freeze'], ['POST', '/wallet/policy']] as const) {
      res = await b.call(method, `/v1/minds/${mindId}${path}`, method === 'POST' ? { perTransactionNear: '0.05', whitelist: ['x.testnet'] } : undefined, origin)
      assert.equal(res.status, 404, `${method} ${path}`)
    }

    // Deleting the Mind removes its wallet row (funds must be moved out first; see docs).
    res = await a.call('DELETE', `/v1/minds/${mindId}`, undefined, origin)
    assert.equal(res.status, 204)
    assert.equal((await query('select 1 from mind_wallets where mind_id = $1', [mindId])).length, 0)
  })

  test('policy: v2 bound to the wallet key, approver = the owner, returned as a store_wallet_policy tx', async () => {
    const a = await signIn()
    const mindId = await mindOf(a)
    const { wallet } = await (await a.call('POST', `/v1/minds/${mindId}/wallet`, {}, origin)).json()
    const w = fakeOutlayer.byAccount(wallet.address)

    for (const bad of [{ perTransactionNear: '0', whitelist: ['a.testnet'] }, { perTransactionNear: '11', whitelist: ['a.testnet'] }, { perTransactionNear: '0.05', whitelist: [] }, { perTransactionNear: '0.05', whitelist: ['Not An Account!'] }, { perTransactionNear: 0.05, whitelist: ['a.testnet'] }]) {
      const res = await a.call('POST', `/v1/minds/${mindId}/wallet/policy`, bad, origin)
      assert.equal(res.status, 400, JSON.stringify(bad))
    }

    const res = await a.call('POST', `/v1/minds/${mindId}/wallet/policy`, { perTransactionNear: '0.05', whitelist: ['shop.testnet', 'Shop.testnet', a.accountId] }, origin)
    assert.equal(res.status, 200, await res.clone().text())
    const { transaction } = await res.json()
    assert.equal(transaction.receiverId, 'outlayer.testnet')
    const [action] = transaction.actions
    assert.equal(action.type, 'FunctionCall')
    assert.equal(action.params.methodName, 'store_wallet_policy')
    assert.equal(action.params.gas, '100000000000000')
    assert.equal(action.params.deposit, fakeOutlayer.policyCost)
    assert.equal(action.params.args.wallet_pubkey, `ed25519:${wallet.address}`)
    assert.match(action.params.args.wallet_signature, /^[0-9a-f]+$/)
    const sign = fakeOutlayer.requests.findLast((r) => r.path === '/wallet/v1/sign-policy')!
    assert.equal(sign.body.caller, a.accountId)

    const policy = JSON.parse(Buffer.from(action.params.args.encrypted_data, 'base64').toString('utf8'))
    assert.deepEqual(policy.rules, { limits: { per_transaction: { native: '50000000000000000000000' } }, addresses: { mode: 'whitelist', list: ['shop.testnet', a.accountId] }, transaction_types: ['transfer'] })
    assert.deepEqual(policy.authorized_key_hashes, [createHash('sha256').update(w.key).digest('hex')])
    assert.deepEqual(policy.approval.approvers, [{ id: a.accountId, role: 'admin' }])
    assert.ok(policy.approval.excluded_types.includes('transfer'))

    // After the owner signs it, the wallet reads it back.
    fakeOutlayer.store(action.params.args.encrypted_data)
    const got = (await (await a.call('GET', `/v1/minds/${mindId}/wallet`)).json()).wallet
    assert.deepEqual(got.policy, { perTransactionNear: '0.05', whitelist: ['shop.testnet', a.accountId], transactionTypes: ['transfer'], boundToThisWallet: true })
  })

  test('freeze and unfreeze come back as owner transactions; OutLayer failures are 502', async () => {
    const a = await signIn()
    const mindId = await mindOf(a)
    const { wallet } = await (await a.call('POST', `/v1/minds/${mindId}/wallet`, {}, origin)).json()
    for (const [path, methodName] of [['freeze', 'freeze_wallet'], ['unfreeze', 'unfreeze_wallet']]) {
      const res = await a.call('POST', `/v1/minds/${mindId}/wallet/${path}`, {}, origin)
      assert.equal(res.status, 200)
      assert.deepEqual((await res.json()).transaction, { receiverId: 'outlayer.testnet', actions: [{ type: 'FunctionCall', params: { methodName, args: { wallet_pubkey: `ed25519:${wallet.address}` }, gas: '30000000000000', deposit: '0' } }] })
    }
    fakeOutlayer.byAccount(wallet.address).frozen = true
    assert.equal((await (await a.call('GET', `/v1/minds/${mindId}/wallet`)).json()).wallet.frozen, true)

    let res = await a.call('POST', `/v1/minds/${mindId}/wallet/freeze`, {}, { origin: 'https://evil.example' })
    assert.equal(res.status, 403)
    res = await a.call('DELETE', `/v1/minds/${mindId}/wallet`, undefined, origin)
    assert.equal(res.status, 405)
    fakeOutlayer.failNext = 1
    res = await a.call('GET', `/v1/minds/${mindId}/wallet`)
    assert.equal(res.status, 502)
    assert.equal((await res.json()).error, 'outlayer_error')
  })
})

describe('payment tools through the backend (#42, option B)', () => {
  const origin = { origin: 'http://localhost:3000' }
  async function walletMind(c: Client, opts: { balanceNear?: string; policy?: boolean } = {}) {
    const mindId = (await (await c.call('POST', '/v1/minds', { templateId: 'payments-mind', name: `Pay ${randomBytes(3).toString('hex')}` }, origin)).json()).mind.id as string
    const { wallet } = await (await c.call('POST', `/v1/minds/${mindId}/wallet`, {}, origin)).json()
    const w = fakeOutlayer.byAccount(wallet.address)
    w.balance = (BigInt(Math.round(Number(opts.balanceNear ?? '1') * 1000)) * 10n ** 21n).toString()
    if (opts.policy !== false) {
      const { transaction } = await (await c.call('POST', `/v1/minds/${mindId}/wallet/policy`, { perTransactionNear: '0.05', whitelist: ['shop.testnet'] }, origin)).json()
      fakeOutlayer.store(transaction.actions[0].params.args.encrypted_data)
    }
    return { mindId, w }
  }
  // What the engine does: take the walletToken from the run body and call the internal route with the engine key.
  async function tokenFromChat(c: Client, mindId: string) {
    const res = await c.call('POST', `/v1/minds/${mindId}/chat`, { message: 'hi' }, origin)
    await res.text()
    return fake.requests.findLast((r) => r.path.endsWith(`/v1/minds/${mindId}/chat`))!.body.walletToken as string | undefined
  }
  const engineCall = (method: string, path: string, token: string | undefined, body?: unknown, engineKey = ENGINE_KEY) => fetch(base + path, {
    method,
    headers: { 'x-engine-key': engineKey, ...(token ? { 'x-wallet-token': token } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  test('the engine gets a wallet token only for a Mind with a wallet, never the key', async () => {
    const a = await signIn()
    const plain = (await (await a.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'Plain' }, origin)).json()).mind.id
    assert.equal(await tokenFromChat(a, plain), undefined)
    const { mindId, w } = await walletMind(a)
    const token = await tokenFromChat(a, mindId)
    assert.match(token!, /^wt_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    const sent = JSON.stringify(fake.requests.findLast((r) => r.path.endsWith(`/v1/minds/${mindId}/chat`))!.body)
    assert.ok(!sent.includes(w.key) && !sent.includes('wk_'))
  })

  test('send_payment: sent with a tx hash, refusals recorded without one, receipts listed', async () => {
    const a = await signIn()
    const { mindId, w } = await walletMind(a)
    const token = await tokenFromChat(a, mindId)

    let res = await engineCall('POST', '/internal/v1/wallet/send_payment', token, { to: 'shop.testnet', amountNear: '0.01' })
    assert.equal(res.status, 200, await res.clone().text())
    const ok = await res.json()
    assert.equal(ok.status, 'sent')
    assert.match(ok.txHash, /^[A-Za-z0-9_-]+$/)
    assert.equal(ok.amountNear, '0.01')
    const transfer = fakeOutlayer.requests.findLast((r) => r.path === '/wallet/v1/transfer')!
    assert.deepEqual(transfer.body, { chain: 'near', to: 'shop.testnet', amount: '10000000000000000000000' })
    assert.equal(transfer.key, w.key)

    res = await engineCall('POST', '/internal/v1/wallet/send_payment', token, { to: 'shop.testnet', amountNear: '0.2' })
    const over = await res.json()
    assert.equal(over.status, 'policy_denied')
    assert.match(over.message, /Per-transaction limit exceeded/)
    assert.equal(over.txHash, undefined)
    res = await engineCall('POST', '/internal/v1/wallet/send_payment', token, { to: 'thief.testnet', amountNear: '0.01' })
    assert.equal((await res.json()).status, 'policy_denied')
    w.frozen = true
    res = await engineCall('POST', '/internal/v1/wallet/send_payment', token, { to: 'shop.testnet', amountNear: '0.01' })
    assert.equal((await res.json()).status, 'wallet_frozen')
    w.frozen = false

    res = await engineCall('GET', '/internal/v1/wallet/balance', token)
    assert.deepEqual(await res.json(), { address: w.account, balanceNear: '0.99' })
    res = await engineCall('GET', '/internal/v1/wallet/payments', token)
    const engineList = (await res.json()).payments
    res = await a.call('GET', `/v1/minds/${mindId}/wallet/payments`)
    const ownerList = (await res.json()).payments
    assert.deepEqual(engineList, ownerList)
    assert.deepEqual(ownerList.map((p: any) => p.status), ['wallet_frozen', 'policy_denied', 'policy_denied', 'sent'])
    assert.ok(ownerList[3].txHash && !ownerList[0].txHash)

    for (const bad of [{ to: 'shop.testnet', amountNear: '0' }, { to: 'shop.testnet', amountNear: 0.01 }, { to: 'NOT VALID', amountNear: '0.01' }]) {
      res = await engineCall('POST', '/internal/v1/wallet/send_payment', token, bad)
      assert.equal(res.status, 400, JSON.stringify(bad))
    }
  })

  test('internal routes answer only on loopback', async () => {
    const { isLoopback } = await import('../src/http.ts')
    for (const a of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1']) assert.equal(isLoopback(a), true, a)
    for (const a of [undefined, '', '192.168.18.10', '::ffff:192.168.18.10', '10.0.0.1', '2001:db8::1', '127.0.0.1.evil']) assert.equal(isLoopback(a), false, String(a))

    const a = await signIn()
    const { mindId } = await walletMind(a)
    const token = await tokenFromChat(a, mindId)
    assert.equal((await engineCall('GET', '/internal/v1/wallet/balance', token)).status, 200)
    // The same valid call from a non-loopback address of this machine (the test server listens on all interfaces).
    const { networkInterfaces } = await import('node:os')
    const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address
    if (!lan) return console.log('no non-loopback IPv4 address here; remote check skipped')
    const remote = await fetch(base.replace('127.0.0.1', lan) + '/internal/v1/wallet/balance', { headers: { 'x-engine-key': ENGINE_KEY, 'x-wallet-token': token! } })
    assert.equal(remote.status, 404)
    assert.deepEqual(await remote.json(), { error: 'not_found' })
  })

  test('an unfunded wallet fails with a clear message', async () => {
    const a = await signIn()
    const { mindId } = await walletMind(a, { balanceNear: '0', policy: false })
    const res = await engineCall('POST', '/internal/v1/wallet/send_payment', await tokenFromChat(a, mindId), { to: 'shop.testnet', amountNear: '0.01' })
    const out = await res.json()
    assert.equal(out.status, 'failed')
    assert.match(out.message, /not funded/)
  })

  test('internal routes need the engine key and a valid, unexpired token for a Mind that still exists', async () => {
    const a = await signIn()
    const { mindId } = await walletMind(a)
    const token = await tokenFromChat(a, mindId)
    const { issueWalletToken } = await import('../src/walletToken.ts')
    const { user } = await (await a.call('GET', '/v1/me')).json()

    let res = await engineCall('GET', '/internal/v1/wallet/balance', token, undefined, 'wrong-key')
    assert.equal(res.status, 401)
    res = await engineCall('GET', '/internal/v1/wallet/balance', undefined)
    assert.equal(res.status, 401)
    res = await engineCall('GET', '/internal/v1/wallet/balance', token!.slice(0, -2) + (token!.endsWith('A') ? 'BB' : 'AA'))
    assert.equal((await res.json()).error, 'invalid_wallet_token')
    res = await engineCall('GET', '/internal/v1/wallet/balance', issueWalletToken(user.id, mindId, Date.now() - 16 * 60 * 1000))
    assert.equal((await res.json()).error, 'wallet_token_expired')
    // A token for another user's Mind (forged with the wrong user) or a deleted Mind gets 404.
    const b = await signIn()
    const { user: other } = await (await b.call('GET', '/v1/me')).json()
    res = await engineCall('GET', '/internal/v1/wallet/balance', issueWalletToken(other.id, mindId))
    assert.equal(res.status, 404)
    res = await engineCall('PUT', '/internal/v1/wallet/balance', token)
    assert.equal(res.status, 405)
    await a.call('DELETE', `/v1/minds/${mindId}`, undefined, origin)
    res = await engineCall('GET', '/internal/v1/wallet/balance', token)
    assert.equal(res.status, 404)
  })
})

describe('judge try-out mode (#43)', () => {
  const origin = { origin: 'http://localhost:3000' }
  const ip = () => `198.51.100.${Math.floor(Math.random() * 250) + 1}`
  async function demoSignIn(fromIp = ip()) {
    const res = await client()('POST', '/v1/auth/demo', {}, { ...origin, 'cf-connecting-ip': fromIp })
    assert.equal(res.status, 201, await res.clone().text())
    const cookie = res.headers.get('set-cookie')!.split(';')[0]
    const { user } = await res.json()
    const call = client(cookie)
    return { user, call: ((m, p, b, h = {}) => call(m, p, b, { 'cf-connecting-ip': fromIp, ...h })) as Client['call'] }
  }
  const lastChatBody = (mindId: string) => fake.requests.findLast((r) => r.path.endsWith(`/v1/minds/${mindId}/chat`))!.body

  test('a demo session without a wallet; the engine is told; payments use the shared demo wallet', async () => {
    const d = await demoSignIn()
    assert.equal(d.user.demo, true)
    assert.match(d.user.nearAccountId, /^demo:/)
    assert.equal((await (await d.call('GET', '/v1/me')).json()).user.demo, true)
    const mindId = (await (await d.call('POST', '/v1/minds', { templateId: 'payments-mind', name: 'Judge pay' }, origin)).json()).mind.id
    await (await d.call('POST', `/v1/minds/${mindId}/chat`, { message: 'hi' }, origin)).text()
    const body = lastChatBody(mindId)
    assert.equal(body.demo, true)
    assert.match(body.walletToken, /^wt_/)
    assert.ok(!JSON.stringify(body).includes(demoWallet.key))
    const { wallet } = await (await d.call('GET', `/v1/minds/${mindId}/wallet`)).json()
    assert.equal(wallet.address, demoWallet.account)
    assert.equal(wallet.shared, true)

    // A wallet-login user's run carries no demo flag.
    const a = await signIn()
    const own = (await (await a.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'Own' }, origin)).json()).mind.id
    await (await a.call('POST', `/v1/minds/${own}/chat`, { message: 'hi' }, origin)).text()
    assert.equal(lastChatBody(own).demo, undefined)
  })

  test('owner-only actions are refused for demo users', async () => {
    const d = await demoSignIn()
    const mindId = (await (await d.call('POST', '/v1/minds', { templateId: 'payments-mind', name: 'Judge' }, origin)).json()).mind.id
    const cases: [string, string, unknown, string][] = [
      ['PUT', '/v1/secrets/SHOP_KEY', { value: 'abcd1234', allowedHosts: ['api.shop.com'] }, 'secrets'],
      ['POST', `/v1/minds/${mindId}/wallet`, {}, 'create_wallet'],
      ['POST', `/v1/minds/${mindId}/wallet/policy`, { perTransactionNear: '0.05', whitelist: ['a.testnet'] }, 'set_policy'],
      ['POST', `/v1/minds/${mindId}/wallet/freeze`, {}, 'freeze'],
      ['PUT', `/v1/minds/${mindId}/workflows/daily-report/autopilot`, {}, 'autopilot'],
    ]
    for (const [method, path, body, action] of cases) {
      const res = await d.call(method, path, body, origin)
      assert.equal(res.status, 403, `${method} ${path}`)
      assert.deepEqual(await res.json(), { error: 'demo_not_allowed', action })
    }
  })

  test('at most 2 sent payments per demo user, then a recorded refusal without calling OutLayer', async () => {
    const d = await demoSignIn()
    const mindId = (await (await d.call('POST', '/v1/minds', { templateId: 'payments-mind', name: 'Judge cap' }, origin)).json()).mind.id
    await (await d.call('POST', `/v1/minds/${mindId}/chat`, { message: 'pay' }, origin)).text()
    const token = lastChatBody(mindId).walletToken
    const pay = () => fetch(`${base}/internal/v1/wallet/send_payment`, { method: 'POST', headers: { 'x-engine-key': ENGINE_KEY, 'x-wallet-token': token, 'content-type': 'application/json' }, body: JSON.stringify({ to: 'shop.testnet', amountNear: '0.01' }) }).then((r) => r.json())
    assert.equal((await pay()).status, 'sent')
    assert.equal((await pay()).status, 'sent')
    const before = fakeOutlayer.requests.filter((r) => r.path === '/wallet/v1/transfer').length
    const third = await pay()
    assert.equal(third.status, 'failed')
    assert.match(third.message, /demo limit/)
    assert.equal(fakeOutlayer.requests.filter((r) => r.path === '/wallet/v1/transfer').length, before)
  })

  test('the payment cap holds for parallel payments', async () => {
    const d = await demoSignIn()
    const mindId = (await (await d.call('POST', '/v1/minds', { templateId: 'payments-mind', name: 'Judge race' }, origin)).json()).mind.id
    await (await d.call('POST', `/v1/minds/${mindId}/chat`, { message: 'pay' }, origin)).text()
    const token = lastChatBody(mindId).walletToken
    const pay = () => fetch(`${base}/internal/v1/wallet/send_payment`, { method: 'POST', headers: { 'x-engine-key': ENGINE_KEY, 'x-wallet-token': token, 'content-type': 'application/json' }, body: JSON.stringify({ to: 'shop.testnet', amountNear: '0.01' }) }).then((r) => r.json())
    const out = await Promise.all([pay(), pay(), pay(), pay(), pay()])
    assert.equal(out.filter((p) => p.status === 'sent').length, 2, JSON.stringify(out.map((p) => p.status)))
    assert.equal(out.filter((p) => p.status === 'failed' && /demo limit/.test(p.message)).length, 3)
  })

  test('hourly windows forget visitors after an hour', async () => {
    const { sweepDemoWindows, resetDemoWindows } = await import('../src/demo.ts')
    resetDemoWindows()
    await demoSignIn()
    await demoSignIn()
    assert.equal(sweepDemoWindows(), 2)
    assert.equal(sweepDemoWindows(Date.now() + 3601_000), 0)
  })

  test('run limit per demo user, sign-up limit per IP, off when DEMO_MODE is not set', async () => {
    const { config } = await import('../src/config.ts')
    const { resetDemoWindows } = await import('../src/demo.ts')
    const saved = { ...config.demo }
    try {
      config.demo.runsPerUser = 1
      const d = await demoSignIn()
      const mindId = (await (await d.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'Judge runs' }, origin)).json()).mind.id
      let res = await d.call('POST', `/v1/minds/${mindId}/chat`, { message: 'one' }, origin)
      assert.equal(res.status, 200)
      await res.text()
      res = await d.call('POST', `/v1/minds/${mindId}/chat`, { message: 'two' }, origin)
      assert.equal(res.status, 429)
      assert.deepEqual(await res.json(), { error: 'demo_run_limit', limit: 1 })

      config.demo.signupsPerIpPerHour = 2
      const fixed = ip()
      await demoSignIn(fixed)
      await demoSignIn(fixed)
      res = await client()('POST', '/v1/auth/demo', {}, { ...origin, 'cf-connecting-ip': fixed })
      assert.equal(res.status, 429)
      assert.equal((await res.json()).error, 'demo_rate_limited')

      config.demoMode = false
      res = await client()('POST', '/v1/auth/demo', {}, { ...origin, 'cf-connecting-ip': ip() })
      assert.equal(res.status, 404)
    } finally {
      Object.assign(config.demo, saved)
      config.demoMode = true
      resetDemoWindows()
    }
  })

  test('demo users older than the retention are deleted with their Minds; others stay', async () => {
    const { cleanupDemoUsers } = await import('../src/demo.ts')
    const d = await demoSignIn()
    const mindId = (await (await d.call('POST', '/v1/minds', { templateId: 'general-assistant', name: 'Old judge' }, origin)).json()).mind.id
    const a = await signIn()
    const { user: real } = await (await a.call('GET', '/v1/me')).json()
    await query(`update users set created_at = now() - interval '8 days' where id = any($1)`, [[d.user.id, real.id]])
    const fresh = await demoSignIn()
    const dropped: string[] = []
    await cleanupDemoUsers(async (id) => { dropped.push(id) })
    assert.ok(dropped.includes(mindId))
    const left = (await query('select id from users where id = any($1)', [[d.user.id, real.id, fresh.user.id]])).map((r) => r.id).sort()
    assert.deepEqual(left, [real.id, fresh.user.id].sort())
    assert.equal((await d.call('GET', '/v1/me')).status, 401)
  })
})

describe('app connections through Composio (#13)', () => {
  test('connect Gmail: Connect Link for this user, pending, then connected; no Composio ids or tokens leave the backend', async () => {
    const a = await signIn()
    const { user } = await (await a.call('GET', '/v1/me')).json()

    let res = await a.call('GET', '/v1/connections')
    assert.equal(res.status, 200)
    assert.deepEqual((await res.json()).connections, [{ toolkit: 'gmail', status: 'not_connected' }])

    res = await a.call('POST', '/v1/connections/gmail', {}, { origin: 'http://localhost:3000' })
    assert.equal(res.status, 200, await res.clone().text())
    const { redirectUrl } = await res.json()
    assert.match(redirectUrl, /^https:\/\//)
    const session = fakeComposio.requests.findLast((r) => r.path === '/tool_router/session')!
    assert.equal(session.body.user_id, user.id)
    assert.deepEqual(session.body.toolkits, { enable: ['gmail'] })
    const link = fakeComposio.requests.findLast((r) => r.path.endsWith('/link'))!
    assert.equal(link.body.callback_url, 'http://localhost:3000/connections?toolkit=gmail')

    res = await a.call('GET', '/v1/connections')
    const pending = (await res.json()).connections[0]
    assert.equal(pending.status, 'pending')
    assert.deepEqual(Object.keys(pending).sort(), ['since', 'status', 'toolkit'])

    // A second attempt replaces the unfinished one: one connection per user and toolkit.
    res = await a.call('POST', '/v1/connections/gmail', {}, { origin: 'http://localhost:3000' })
    assert.equal(res.status, 200)
    assert.equal(fakeComposio.accounts.filter((x) => x.user_id === user.id).length, 1)

    fakeComposio.activate(user.id)
    res = await a.call('GET', '/v1/connections')
    assert.equal((await res.json()).connections[0].status, 'connected')
    res = await a.call('POST', '/v1/connections/gmail', {}, { origin: 'http://localhost:3000' })
    assert.equal(res.status, 409)
    assert.equal((await res.json()).error, 'already_connected')

    // Another user neither sees nor deletes it.
    const b = await signIn()
    res = await b.call('GET', '/v1/connections')
    assert.equal((await res.json()).connections[0].status, 'not_connected')
    res = await b.call('DELETE', '/v1/connections/gmail', undefined, { origin: 'http://localhost:3000' })
    assert.equal(res.status, 404)
    assert.equal(fakeComposio.accounts.filter((x) => x.user_id === user.id).length, 1)

    res = await a.call('DELETE', '/v1/connections/gmail', undefined, { origin: 'http://localhost:3000' })
    assert.equal(res.status, 204)
    assert.equal(fakeComposio.accounts.filter((x) => x.user_id === user.id).length, 0)
    res = await a.call('GET', '/v1/connections')
    assert.equal((await res.json()).connections[0].status, 'not_connected')
  })

  test('unknown toolkit, wrong method, CSRF, Composio failure and no key', async () => {
    const a = await signIn()
    let res = await a.call('POST', '/v1/connections/slack', {}, { origin: 'http://localhost:3000' })
    assert.equal(res.status, 404)
    assert.equal((await res.json()).error, 'unknown_toolkit')
    res = await a.call('PUT', '/v1/connections/gmail', {}, { origin: 'http://localhost:3000' })
    assert.equal(res.status, 405)
    res = await a.call('POST', '/v1/connections/gmail', {}, { origin: 'https://evil.example' })
    assert.equal(res.status, 403)
    res = await client()('GET', '/v1/connections')
    assert.equal(res.status, 401)

    fakeComposio.failNext = 1
    res = await a.call('GET', '/v1/connections')
    assert.equal(res.status, 502)
    assert.equal((await res.json()).error, 'composio_error')

    const key = config.composioApiKey
    config.composioApiKey = ''
    try {
      res = await a.call('GET', '/v1/connections')
      assert.equal(res.status, 503)
      assert.equal((await res.json()).error, 'composio_not_configured')
    } finally {
      config.composioApiKey = key
    }
  })
})
