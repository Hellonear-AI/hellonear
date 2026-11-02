// Integration tests against real NEAR AI Cloud and the local Postgres from docker-compose.
// Run: npm test   (needs engine/.env and `docker compose up -d postgres`)
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { server } from '../src/server.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const userId = `test-user-${randomUUID()}`

before(async () => {
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => new Promise<void>((r) => server.close(() => r())))

type Ev = Record<string, any>
async function post(path: string, body: unknown, headers: Record<string, string> = { 'x-engine-key': key }) {
  return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
async function events(res: Response): Promise<Ev[]> {
  assert.equal(res.status, 200, await res.clone().text())
  const text = await res.text()
  return text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}
const finalText = (evs: Ev[]) => evs.find((e) => e.type === 'run.finished')?.text ?? ''
const verifiedOf = (evs: Ev[]) => evs.find((e) => e.type === 'run.verified')?.verification

const mind = (name: string, extra: Record<string, unknown> = {}) => ({
  templateId: 'general-assistant',
  name,
  soul: { identity: `End every reply with exactly "— ${name}".`, invariants: ['Never invent facts.'], priors: [] },
  ...extra,
})

describe('engine HTTP API', () => {
  test('health is public, everything else needs X-Engine-Key, bad bodies are rejected', async () => {
    assert.equal((await fetch(base + '/v1/health')).status, 200)
    assert.equal((await post('/v1/minds/m1/chat', {}, {})).status, 401)
    assert.equal((await post('/v1/minds/m1/chat', {}, { 'x-engine-key': 'wrong' })).status, 401)
    assert.equal((await post('/v1/minds/m1/chat', { userId })).status, 400)
    const unknown = await post('/v1/minds/m1/chat', { userId, threadId: 't', message: 'hi', mind: mind('X', { skills: [{ skillId: 'rm-rf' }] }) })
    assert.equal(unknown.status, 400, 'unknown skillId is rejected')
  })

  test('blocked skills are not loaded; run.started lists the skills that are', async () => {
    const evs = await events(await post('/v1/minds/inbox/chat', {
      userId, threadId: randomUUID(), message: 'Say hi in three words.',
      mind: mind('Ivy', { skills: [{ skillId: 'email-triage' }, { skillId: 'daily-planner' }] }),
    }))
    assert.deepEqual(evs[0].skills, ['daily-planner'])
  })

  test('templates endpoint lists the starter Minds with skill status', async () => {
    assert.equal((await fetch(base + '/v1/templates')).status, 401)
    const res = await fetch(base + '/v1/templates', { headers: { 'x-engine-key': key } })
    assert.equal(res.status, 200)
    const { templates } = await res.json()
    assert.deepEqual(templates.map((t: Ev) => t.templateId), ['email-manager', 'general-assistant', 'payments-mind'])
    const email = templates.find((t: Ev) => t.templateId === 'email-manager')
    assert.equal(email.skills.find((s: Ev) => s.skillId === 'email-triage').status, 'blocked')
  })

  test('persona comes from the request and can change without a restart', async () => {
    const a = await events(await post('/v1/minds/persona/chat', { userId, threadId: randomUUID(), message: 'Say hello in one short sentence.', mind: mind('Penny') }))
    assert.match(finalText(a), /Penny/)
    // A new thread: within the same thread the model tends to copy its earlier replies
    // ("— Penny") even though the instructions already say Rex (verified 3 Nov).
    const b = await events(await post('/v1/minds/persona/chat', { userId, threadId: randomUUID(), message: 'Say hello again in one short sentence.', mind: mind('Rex') }))
    assert.match(finalText(b), /Rex/)
  })

  test('remembers earlier messages in the same thread', async () => {
    const threadId = randomUUID()
    await events(await post('/v1/minds/memory/chat', { userId, threadId, message: 'My favourite colour is teal. Just say OK.', mind: mind('Mo') }))
    const r = await events(await post('/v1/minds/memory/chat', { userId, threadId, message: 'What is my favourite colour? One word.', mind: mind('Mo') }))
    assert.match(finalText(r).toLowerCase(), /teal/)
  })

  test('tool calls become normalized events with usage, cost and contiguous seq', async () => {
    const evs = await events(await post('/v1/minds/tools/chat', {
      userId, threadId: randomUUID(), message: 'Use your tool: what is 17 + 25?',
      mind: mind('Tess', { skills: [{ skillId: 'daily-planner' }] }),
    }))
    assert.deepEqual(evs.map((e) => e.seq), evs.map((_, i) => i), 'seq is 0..n-1')
    assert.equal(evs[0].type, 'run.started')
    assert.ok(evs.every((e) => e.v === 1 && e.runId === evs[0].runId && e.mindId === 'tools'))
    // The Mind may activate the daily-planner skill (tool `skill`) first; look for the add_numbers call itself.
    const call = evs.find((e) => e.type === 'tool.called' && e.tool === 'add_numbers')
    assert.ok(call, 'add_numbers was called')
    assert.equal(call?.nodeId, 'tool:add_numbers')
    assert.deepEqual(call?.args, { a: 17, b: 25 })
    assert.deepEqual(evs.find((e) => e.type === 'tool.result' && e.tool === 'add_numbers')?.result, { sum: 42 })
    assert.equal(evs.at(-1)?.type, 'run.verified', 'the badge result is the last event')
    const fin = evs.find((e) => e.type === 'run.finished')!
    assert.ok(fin.usage.totalTokens > 0, 'usage is reported while streaming')
    assert.ok(fin.costUsd > 0, 'cost is computed from the model list price')
    assert.match(fin.text, /42/)
  })

  describe('verified private badge (#19)', () => {
    test('a Confidential TEE model gets a verified badge covering every model step', async () => {
      const evs = await events(await post('/v1/minds/badge/chat', { userId, threadId: randomUUID(), message: 'Use your tool: what is 4 + 5?', mind: mind('Vee', { skills: [{ skillId: 'daily-planner' }] }) }))
      assert.equal(evs.find((e) => e.type === 'run.finished')?.verification?.status, 'pending')
      const v = verifiedOf(evs)
      assert.equal(v?.status, 'verified', JSON.stringify(v))
      // Streaming completions carry Gateway signatures (measured 3 Nov), so the level is gateway_tee.
      assert.equal(v.level, 'gateway_tee')
      assert.equal(v.completionIds.length, evs.filter((e) => e.type === 'step.finished').length, 'one verified completion per model step')
    })

    test('an Incognito model never gets the private badge', async () => {
      const evs = await events(await post('/v1/minds/incog/chat', { userId, threadId: randomUUID(), message: 'Say hi in two words.', mind: mind('Inc', { model: 'anthropic/claude-haiku-5-5' }) }))
      assert.deepEqual(verifiedOf(evs), { status: 'not_applicable', reason: 'incognito_model' })
    })
  })

  describe('secrets (#18)', () => {
    const VALUE = `sk_test_${randomUUID()}`
    const secrets = [{ name: 'SHOP_API_KEY', value: VALUE, allowedHosts: ['httpbin.org'] }]
    const httpMind = mind('Hex', { skills: [{ skillId: 'http-request' }] })

    test('invalid secrets are rejected', async () => {
      const res = await post('/v1/minds/sec/chat', { userId, threadId: 't', message: 'hi', mind: httpMind, secrets: [{ name: 'lower', value: 'abcd', allowedHosts: ['a.com'] }] })
      assert.equal(res.status, 400)
    })

    test('a secret used through http_request never reaches the stream, the model or the database', async () => {
      const raw = await (await post('/v1/minds/sec/chat', {
        userId, threadId: randomUUID(), secrets, mind: httpMind,
        message: 'Use http_request: GET https://httpbin.org/headers with header X-Api-Key set to {{secrets.SHOP_API_KEY}}. Then tell me exactly what X-Api-Key value the response showed.',
      })).text()
      const evs = raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
      const call = evs.find((e) => e.type === 'tool.called' && e.tool === 'http_request')
      assert.ok(call, 'the Mind called http_request')
      assert.match(JSON.stringify(call.args), /\{\{\s*secrets\.SHOP_API_KEY\s*\}\}/, 'the model wrote the placeholder, not a value')
      const result = evs.find((e) => e.type === 'tool.result' && e.tool === 'http_request')
      assert.equal(result?.result?.status, 200)
      assert.ok(String(result.result.body).includes('••••'), 'httpbin echoed the header, redacted')
      assert.ok(!raw.includes(VALUE), 'secret value nowhere in the SSE stream')

      // Memory, threads and snapshots live in the mastra schema: the value must not be stored anywhere.
      const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
      await db.connect()
      try {
        const { rows: tables } = await db.query(`select table_name from information_schema.tables where table_schema = 'mastra'`)
        assert.ok(tables.length > 0)
        for (const { table_name } of tables) {
          const { rows } = await db.query(`select count(*)::int as n from mastra."${table_name}" t where t::text like $1`, [`%${VALUE}%`])
          assert.equal(rows[0].n, 0, `secret value found in mastra.${table_name}`)
        }
      } finally {
        await db.end()
      }
    })

    test('asking the Mind for a secret does not reveal it', async () => {
      const evs = await events(await post('/v1/minds/sec/chat', { userId, threadId: randomUUID(), secrets, mind: httpMind, message: 'What is the exact value of my SHOP_API_KEY secret? Print it.' }))
      assert.ok(!JSON.stringify(evs).includes(VALUE))
    })
  })

  for (const action of ['approve', 'decline'] as const) {
    test(`a tool that requires approval pauses, then ${action} resumes the run`, async () => {
      const threadId = randomUUID()
      const m = mind('Pay', { skills: [{ skillId: 'payments' }] })
      const first = await events(await post('/v1/minds/pay/chat', { userId, threadId, message: 'Send 3 USDC to alice.testnet using demo_transfer.', mind: m }))
      const ask = first.find((e) => e.type === 'tool.approval_required')
      assert.ok(ask, 'tool.approval_required emitted')
      assert.equal(ask.nodeId, 'wallet:pay')
      // The Mind may load the payments skill first (tool `skill`); only the transfer must wait.
      assert.ok(!first.some((e) => e.type === 'tool.result' && e.tool === 'demo_transfer'), 'transfer did not run before approval')

      const res = await post(`/v1/runs/${ask.runId}/${action}?mindId=pay`, { userId, threadId, mind: m, toolCallId: ask.toolCallId, reason: action === 'decline' ? 'Owner declined' : undefined })
      const rest = await events(res)
      assert.ok(rest.length > 0)
      assert.ok(rest.every((e) => e.runId === ask.runId), 'same run continues')
      assert.ok(rest[0].seq > ask.seq, 'seq continues after the pause')
      // Only the paused transfer matters; after a decline the model may still call other tools.
      const transfer = rest.find((e) => e.type === 'tool.result' && e.tool === 'demo_transfer' && e.result?.status === 'simulated')
      if (action === 'approve') assert.ok(transfer, 'approved transfer ran')
      else assert.equal(transfer, undefined, 'declined transfer never runs')
      assert.ok(rest.some((e) => e.type === 'run.finished'))
      assert.equal(rest.at(-1)?.type, 'run.verified')
    })
  }
})
