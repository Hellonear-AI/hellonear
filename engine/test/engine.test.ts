// Integration tests against real NEAR AI Cloud and the local Postgres from docker-compose.
// Run: npm test   (needs engine/.env and `docker compose up -d postgres`)
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { server } from '../src/server.ts'
import { parseSkillMd, skillCatalog } from '../src/skills.ts'

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
    const notJson = await fetch(base + '/v1/minds/m1/chat', { method: 'POST', headers: { 'x-engine-key': key }, body: '{nope' })
    assert.deepEqual([notJson.status, await notJson.json()], [400, { error: 'invalid_json' }])
    const huge = await post('/v1/minds/m1/chat', { userId, threadId: 't', message: 'x'.repeat(300 * 1024), mind: mind('X') })
    assert.deepEqual([huge.status, await huge.json()], [413, { error: 'body_too_large' }])
  })

  test('blocked skills are not loaded; run.started lists the skills that are', async () => {
    // No catalog skill is blocked right now, so add one for this test only.
    skillCatalog.set('test-blocked', parseSkillMd(`---\nname: test-blocked\ndescription: d\nmetadata:\n  hellonear:\n    tools: [get_time]\n    connections: []\n    status: blocked\n---\n# Body\n`, 'test-blocked'))
    try {
      const evs = await events(await post('/v1/minds/inbox/chat', {
        userId, threadId: randomUUID(), message: 'Say hi in three words.',
        mind: mind('Ivy', { skills: [{ skillId: 'test-blocked' }, { skillId: 'daily-planner' }] }),
      }))
      assert.deepEqual(evs[0].skills, ['daily-planner'])
    } finally {
      skillCatalog.delete('test-blocked')
    }
  })

  test('templates endpoint lists the starter Minds with skill status', async () => {
    assert.equal((await fetch(base + '/v1/templates')).status, 401)
    const res = await fetch(base + '/v1/templates', { headers: { 'x-engine-key': key } })
    assert.equal(res.status, 200)
    const { templates } = await res.json()
    assert.deepEqual(templates.map((t: Ev) => t.templateId), ['email-manager', 'general-assistant', 'payments-mind'])
    const email = templates.find((t: Ev) => t.templateId === 'email-manager')
    assert.equal(email.skills.find((s: Ev) => s.skillId === 'email-triage').status, 'available')
    assert.equal(email.quote, 'I read the noise so you only see what matters.')
  })

  test('skills endpoint lists the whole catalog for the backend and the Builder', async () => {
    assert.equal((await fetch(base + '/v1/skills')).status, 401)
    const res = await fetch(base + '/v1/skills', { headers: { 'x-engine-key': key } })
    assert.equal(res.status, 200)
    const { skills } = await res.json()
    assert.deepEqual(skills.map((s: Ev) => s.skillId), ['daily-planner', 'email-triage', 'http-request', 'morning-briefing', 'near-account', 'payments', 'subscriptions'])
    assert.deepEqual(skills.find((s: Ev) => s.skillId === 'near-account'), {
      skillId: 'near-account', description: skills.find((s: Ev) => s.skillId === 'near-account').description, status: 'available', connections: [], tools: ['near_view_account'],
    })
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

  test('a thread\'s first run gets a short title between run.finished and run.verified; later runs do not (#86)', async () => {
    const threadId = randomUUID()
    const first = await events(await post('/v1/minds/titles/chat', { userId, threadId, message: 'Bantu aku rencanakan liburan tiga hari ke Bali. Cukup dua kalimat.', mind: mind('Tia') }))
    const titled = first.filter((e) => e.type === 'thread.titled')
    assert.equal(titled.length, 1, 'one title on the first run')
    assert.equal(titled[0].threadId, threadId)
    assert.ok(titled[0].title.length > 0 && titled[0].title.length <= 61 && !titled[0].title.includes('\n'), titled[0].title)
    const types = first.map((e) => e.type)
    assert.ok(types.indexOf('run.finished') < types.indexOf('thread.titled') && types.indexOf('thread.titled') === types.length - 2, types.join(','))
    assert.equal(types.at(-1), 'run.verified')
    assert.deepEqual(first.map((e) => e.seq), first.map((_, i) => i), 'seq stays contiguous')
    const second = await events(await post('/v1/minds/titles/chat', { userId, threadId, message: 'Satu kalimat saja: hari pertama ke mana?', mind: mind('Tia') }))
    assert.ok(!second.some((e) => e.type === 'thread.titled'), 'no title on a later run')
  })

  test('GLM-5.3 Flash reasons briefly and still writes a reply (#92)', async () => {
    const evs = await events(await post('/v1/minds/reasoning/chat', { userId, threadId: randomUUID(), message: 'Use your tool: what is 17 + 25? Answer with the number.', mind: mind('Rea', { skills: [{ skillId: 'daily-planner' }], model: 'z-ai/glm-5.3-flash' }) }))
    const fin = evs.find((e) => e.type === 'run.finished')
    assert.equal(fin?.finishReason, 'stop')
    assert.match(finalText(evs), /42/)
    // Default reasoning used ~300 tokens on this prompt (measured 9 Nov); low stays far below.
    assert.ok((fin?.usage?.reasoningTokens ?? 0) < 150, `reasoning tokens ${fin?.usage?.reasoningTokens}`)
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
    test('attestation can be warmed and is reported by /v1/health', async () => {
      const { warmAttestation } = await import('../src/models.ts')
      const { warmModels } = await import('../src/server.ts')
      await warmAttestation(warmModels())
      const health = await (await fetch(base + '/v1/health')).json()
      assert.equal(health.attestation['z-ai/glm-5.3-flash']?.ok, true, JSON.stringify(health.attestation))
    })

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

  // Email tools (#13, #43): try-out runs read the sample inbox; owners read their Gmail through Composio. With the
  // real COMPOSIO_API_KEY from .env, a test user has no Gmail connection, so this also checks Composio's live answer.
  describe('email tools', () => {
    const inbox = mind('Ivy', { templateId: 'email-manager', skills: [{ skillId: 'email-triage' }] })

    test('a try-out run (demo: true) reads the sample inbox on the gmail App node', async () => {
      const evs = await events(await post('/v1/minds/inbox/chat', { userId, threadId: randomUUID(), demo: true, mind: inbox, message: 'List my latest emails with gmail_list_emails and summarize them.' }))
      const listed = evs.find((e) => e.type === 'tool.result' && e.tool === 'gmail_list_emails')
      assert.ok(listed, JSON.stringify(evs.filter((e) => e.tool)))
      assert.equal(listed.nodeId, 'app:gmail')
      assert.equal(listed.result.source, 'sample_inbox')
      assert.ok(listed.result.emails.length > 0)
      assert.equal(evs.at(-1)?.type, 'run.verified')
    })

    test('an owner without a Gmail connection is told to connect it (live Composio answer)', async () => {
      const evs = await events(await post('/v1/minds/inbox/chat', { userId, threadId: randomUUID(), mind: inbox, message: 'List my latest emails with gmail_list_emails.' }))
      const err = evs.find((e) => e.type === 'tool.error' && e.tool === 'gmail_list_emails')
      assert.match(err?.error ?? '', /Gmail is not connected/, JSON.stringify(evs.filter((e) => e.tool)))
      assert.ok(!evs.some((e) => e.type === 'tool.result' && e.result?.source === 'sample_inbox'), 'owners never see the sample inbox')
    })
  })

  // Read-only skills over the sample data (#104, #105): what they read, and that they never write or pay.
  describe('briefing and subscription skills', () => {
    const noWrites = (evs: Ev[]) => !evs.some((e) => e.type === 'tool.approval_required' || (e.type === 'tool.called' && ['send_payment', 'googlecalendar_create_event', 'googlecalendar_create_meeting', 'gmail_create_draft'].includes(e.tool)))

    test('morning-briefing reads the calendar and the inbox, and acts on nothing (#104)', async () => {
      const m = mind('Bri', { skills: [{ skillId: 'morning-briefing' }] })
      const evs = await events(await post('/v1/minds/brief/chat', { userId, threadId: randomUUID(), demo: true, mind: m, message: 'Brief me on today.' }))
      const read = evs.filter((e) => e.type === 'tool.result').map((e) => e.tool)
      assert.ok(read.includes('googlecalendar_list_events') && read.includes('gmail_list_emails'), JSON.stringify(read))
      assert.ok(noWrites(evs), 'a briefing never pays, books or drafts')
      assert.ok(finalText(evs).length > 0)
      assert.equal(evs.at(-1)?.type, 'run.verified')
    })

    test('subscriptions finds the sample subscriptions and pays nothing (#105)', async () => {
      const m = mind('Sub', { skills: [{ skillId: 'subscriptions' }] })
      const evs = await events(await post('/v1/minds/subs/chat', { userId, threadId: randomUUID(), demo: true, mind: m, message: 'Which subscriptions do I pay for, and what do they cost per month?' }))
      assert.ok(evs.some((e) => e.type === 'tool.result' && e.tool === 'gmail_list_emails'), JSON.stringify(evs.filter((e) => e.tool).map((e) => e.tool)))
      assert.ok(noWrites(evs), 'the tracker never pays or books on its own')
      assert.match(finalText(evs), /StreamBox|CloudNotes/)
    })
  })

  // Calendar tools (#57): same split as email. A test user has no Calendar connection, so Composio answers live.
  describe('calendar tools', () => {
    const planner = mind('Cal', { skills: [{ skillId: 'daily-planner' }] })

    test('a try-out run reads the sample calendar on the googlecalendar App node', async () => {
      const evs = await events(await post('/v1/minds/cal/chat', { userId, threadId: randomUUID(), demo: true, mind: planner, message: 'What is on my calendar this week? Use googlecalendar_list_events.' }))
      const listed = evs.find((e) => e.type === 'tool.result' && e.tool === 'googlecalendar_list_events')
      assert.ok(listed, JSON.stringify(evs.filter((e) => e.tool)))
      assert.equal(listed.nodeId, 'app:googlecalendar')
      assert.equal(listed.result.source, 'sample_calendar')
      assert.ok(listed.result.events.length > 0)
      assert.equal(evs.at(-1)?.type, 'run.verified')
    })

    for (const action of ['approve', 'decline'] as const) {
      test(`googlecalendar_create_event pauses for approval, then ${action} resumes the run`, async () => {
        const threadId = randomUUID()
        const first = await events(await post('/v1/minds/cal/chat', { userId, threadId, demo: true, mind: planner, message: 'Add "Dentist" to my calendar on 2026-11-20 from 15:00 to 16:00 at +07:00 with googlecalendar_create_event.' }))
        const ask = first.find((e) => e.type === 'tool.approval_required')
        assert.ok(ask, JSON.stringify(first.filter((e) => e.tool)))
        assert.equal(ask.tool, 'googlecalendar_create_event')
        assert.equal(ask.nodeId, 'app:googlecalendar')
        assert.ok(!first.some((e) => e.type === 'tool.result' && e.tool === 'googlecalendar_create_event'), 'nothing written before approval')
        const rest = await events(await post(`/v1/runs/${ask.runId}/${action}?mindId=cal`, { userId, threadId, demo: true, mind: planner, toolCallId: ask.toolCallId, reason: action === 'decline' ? 'Owner declined' : undefined }))
        const made = rest.find((e) => e.type === 'tool.result' && e.tool === 'googlecalendar_create_event')
        if (action === 'approve') assert.equal(made?.result?.status, 'created')
        else assert.equal(made, undefined, 'a declined event is never created')
        assert.equal(rest.at(-1)?.type, 'run.verified')
      })
    }

    test('an owner without a Calendar connection is told to connect it (live Composio answer)', async () => {
      const evs = await events(await post('/v1/minds/cal/chat', { userId, threadId: randomUUID(), mind: planner, message: 'What is on my calendar this week? Use googlecalendar_list_events.' }))
      const err = evs.find((e) => e.type === 'tool.error' && e.tool === 'googlecalendar_list_events')
      assert.match(err?.error ?? '', /Google Calendar is not connected/, JSON.stringify(evs.filter((e) => e.tool)))
      assert.ok(!evs.some((e) => e.type === 'tool.result' && e.result?.source === 'sample_calendar'), 'owners never see the sample calendar')
    })
  })

  // Payment tools (#42) call the backend; here a fake one stands in for it (the real one is e2e-tested with James's branch).
  describe('payments through the wallet token', () => {
    const TOKEN = `wt_${randomUUID()}`
    const payments: { token: unknown; key: unknown; body: { to: string; amountNear: string } }[] = []
    const backend = createServer(async (req, res) => {
      let raw = ''
      for await (const c of req) raw += c
      const send = (json: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(json))
      if (req.url !== '/internal/v1/wallet/send_payment') return send({ address: 'abc', balanceNear: '0.5', payments: [] })
      const body = JSON.parse(raw)
      payments.push({ token: req.headers['x-wallet-token'], key: req.headers['x-engine-key'], body })
      if (body.to === 'stranger.testnet') return send({ paymentId: 'p-denied', status: 'policy_denied', to: body.to, amountNear: body.amountNear, message: "Address 'stranger.testnet' is not in whitelist" })
      send({ paymentId: 'p-sent', status: 'sent', to: body.to, amountNear: body.amountNear, txHash: 'FakeTxHash1' })
    })
    before(async () => {
      await new Promise<void>((r) => backend.listen(0, '127.0.0.1', r))
      process.env.BACKEND_URL = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`
    })
    after(() => new Promise<void>((r) => backend.close(() => r())))
    const m = mind('Pay', { skills: [{ skillId: 'payments' }] })

    for (const action of ['approve', 'decline'] as const) {
      test(`send_payment pauses for approval, then ${action} resumes the run`, async () => {
        const threadId = randomUUID()
        const before = payments.length
        const first = await events(await post('/v1/minds/pay/chat', { userId, threadId, walletToken: TOKEN, message: 'Send 0.01 NEAR to alice.testnet with send_payment.', mind: m }))
        const ask = first.find((e) => e.type === 'tool.approval_required')
        assert.ok(ask, 'tool.approval_required emitted')
        assert.equal(ask.tool, 'send_payment')
        assert.equal(ask.nodeId, 'wallet:pay')
        assert.equal(payments.length, before, 'nothing reached the wallet before approval')

        const res = await post(`/v1/runs/${ask.runId}/${action}?mindId=pay`, { userId, threadId, walletToken: TOKEN, mind: m, toolCallId: ask.toolCallId, reason: action === 'decline' ? 'Owner declined' : undefined })
        const rest = await events(res)
        assert.ok(rest.every((e) => e.runId === ask.runId), 'same run continues')
        assert.ok(rest[0].seq > ask.seq, 'seq continues after the pause')
        const sent = rest.find((e) => e.type === 'tool.result' && e.tool === 'send_payment')
        if (action === 'approve') {
          assert.equal(sent?.result?.status, 'sent')
          assert.equal(sent?.result?.txHash, 'FakeTxHash1')
          assert.deepEqual(payments.at(-1), { token: TOKEN, key: key, body: { to: 'alice.testnet', amountNear: '0.01' } })
        } else {
          assert.equal(sent, undefined, 'declined payment never runs')
          assert.equal(payments.length, before, 'declined payment never reaches the wallet')
        }
        assert.equal(rest.at(-1)?.type, 'run.verified')
        assert.ok(![...first, ...rest].some((e) => JSON.stringify(e).includes(TOKEN)), 'the wallet token is in no event')
      })
    }

    test('a policy refusal is a tool.error with status policy_denied and no tx hash', async () => {
      const threadId = randomUUID()
      const first = await events(await post('/v1/minds/pay/chat', { userId, threadId, walletToken: TOKEN, message: 'Send 0.01 NEAR to stranger.testnet with send_payment.', mind: m }))
      const ask = first.find((e) => e.type === 'tool.approval_required')
      assert.ok(ask, 'tool.approval_required emitted')
      const rest = await events(await post(`/v1/runs/${ask.runId}/approve?mindId=pay`, { userId, threadId, walletToken: TOKEN, mind: m, toolCallId: ask.toolCallId }))
      const refused = rest.find((e) => e.tool === 'send_payment' && e.type === 'tool.error')
      assert.equal(refused?.status, 'policy_denied')
      assert.equal(refused?.nodeId, 'wallet:pay')
      assert.match(refused?.error, /whitelist/)
      assert.equal(refused?.result?.txHash, undefined)
      assert.ok(!rest.some((e) => e.type === 'tool.result' && e.tool === 'send_payment'), 'not reported as a success')
    })

    test('the wallet token is stored in no mastra table', async () => {
      const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
      await db.connect()
      try {
        const { rows: tables } = await db.query(`select table_name from information_schema.tables where table_schema = 'mastra'`)
        for (const { table_name } of tables) {
          const { rows } = await db.query(`select count(*)::int as n from mastra."${table_name}" t where t::text like $1`, [`%${TOKEN}%`])
          assert.equal(rows[0].n, 0, `wallet token found in mastra.${table_name}`)
        }
      } finally {
        await db.end()
      }
    })

    test('a Mind without a wallet gets "no wallet yet" and the backend is not called', async () => {
      const before = payments.length
      const evs = await events(await post('/v1/minds/pay/chat', { userId, threadId: randomUUID(), message: 'What is your wallet balance? Use get_balance.', mind: m }))
      const err = evs.find((e) => e.type === 'tool.error' && e.tool === 'get_balance')
      assert.match(err?.error ?? '', /no wallet yet/)
      assert.equal(payments.length, before)
    })
  })
})
