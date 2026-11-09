// Opt-in live check against the real AgentMail API (#96). Skipped unless AGENTMAIL_LIVE=1, so CI and `bun run test`
// never call AgentMail. Needs AGENTMAIL_API_KEY in .env and the local Postgres.
//   AGENTMAIL_LIVE=1 bun run test
// It creates (or reuses) ONE inbox, `hellonear-demo@agentmail.to` with client_id `hellonear-demo`, twice, to prove
// client_id idempotency; then a try-out Mind in the local DB sends one email to that inbox itself through src/mail.ts
// and reads it back. Optional: AGENTMAIL_LIVE_TO=<address> also sends one clearly labelled test email there (only to
// the account owner). It never deletes anything and never prints the key.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const LIVE = process.env.AGENTMAIL_LIVE === '1'
const DEMO = 'hellonear-demo'

test('AgentMail live: client_id idempotency, a send to the demo inbox itself, list and read', { skip: !LIVE && 'set AGENTMAIL_LIVE=1' }, async () => {
  const key = process.env.AGENTMAIL_API_KEY
  assert.ok(key, 'AGENTMAIL_API_KEY is not set')
  const api = process.env.AGENTMAIL_URL ?? 'https://api.agentmail.to/v0'
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(api + path, { method, headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: res.status, body: (await res.json().catch(() => null)) as any }
  }

  const create = () => call('POST', '/inboxes', { username: DEMO, display_name: 'HelloNear demo', client_id: DEMO })
  const first = await create()
  console.log('create #1', first.status, first.body?.inbox_id, first.body?.email, first.body?.client_id ?? '')
  assert.equal(first.status, 200, JSON.stringify({ code: first.body?.code, message: first.body?.message }))
  const second = await create()
  console.log('create #2', second.status, second.body?.inbox_id)
  assert.equal(second.status, 200)
  assert.equal(second.body.inbox_id, first.body.inbox_id)
  const list = await call('GET', '/inboxes?limit=50')
  const ours = (list.body?.inboxes ?? []).filter((i: any) => i.client_id === DEMO)
  console.log('inboxes in org', list.body?.count, 'with client_id hellonear-demo', ours.length)
  assert.equal(ours.length, 1)
  const demo = String(first.body.email).toLowerCase()
  assert.equal(first.body.inbox_id.toLowerCase(), demo, 'inbox_id is the address (DEMO_AGENTMAIL_INBOX relies on it)')

  // Through the backend's own code: a try-out user's Mind on the shared demo inbox.
  process.env.DEMO_AGENTMAIL_INBOX = demo
  const { query, migrate, pool } = await import('../src/db.ts')
  const { sendMail, listMail, readMail } = await import('../src/mail.ts')
  const { newId } = await import('../src/crypto.ts')
  try {
    await migrate()
    const userId = newId('usr')
    const mindId = newId('mnd')
    await query('insert into users (id, near_account_id, is_demo) values ($1, $2, true)', [userId, `demo:${userId}`])
    await query(`insert into minds (id, user_id, template_id, name, soul) values ($1, $2, 'general-assistant', 'Live check', '{"identity":"x","invariants":[],"priors":[]}')`, [mindId, userId])
    await query(`insert into mind_skills (mind_id, skill_id, position) values ($1, 'email-address', 0)`, [mindId])

    const sent = await sendMail(mindId, { to: [demo], subject: `HelloNear live check ${new Date().toISOString()}`, text: 'HelloNear test (#96): a try-out Mind writing to its own shared demo inbox.' }, { cap: { userId, max: 2 } })
    console.log('send to itself', sent.status, sent.code ?? '', sent.message ?? '', sent.messageId ?? '')
    assert.equal(sent.status, 'sent', JSON.stringify(sent))

    let found: any
    for (let i = 0; i < 10 && !found; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const listed = await listMail(mindId, 10)
      found = listed.messages.find((m) => m.subject === sent.subject && m.direction === 'received')
      if (i === 0) console.log('listed', listed.messages.slice(0, 4).map((m) => ({ subject: m.subject, labels: m.labels, direction: m.direction, armor: m.agentArmor })))
    }
    assert.ok(found, 'the email to itself arrived in the demo inbox within 20 s')
    const read = await readMail(mindId, found.messageId)
    console.log('read', { from: read.from, labels: read.labels, agentArmor: read.agentArmor, warnings: read.warnings, text: read.text.slice(0, 80) })
    assert.match(read.text, /HelloNear test/)

    const to = process.env.AGENTMAIL_LIVE_TO
    if (to) {
      // An owner's send (no try-out restriction) to the account owner, from the demo inbox, through the same code.
      await query('update users set is_demo = false where id = $1', [userId])
      await query('insert into mind_inboxes (mind_id, inbox_id, email) values ($1, $2, $2)', [mindId, demo])
      const owner = await sendMail(mindId, { to: [to], subject: 'HelloNear test email (#96), please ignore', text: 'This is a test from the HelloNear backend (issue #96): a Mind sending from its own AgentMail address. No action needed.' })
      console.log('send to owner', owner.status, owner.code ?? '', owner.message ?? '')
    }
    await query('delete from users where id = $1', [userId])
  } finally {
    await pool.end()
  }
})
