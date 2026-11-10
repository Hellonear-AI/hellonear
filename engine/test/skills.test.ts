// Unit tests for the skill catalog (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillMd, skillCatalog, skillCatalogSummaries, usableSkills } from '../src/skills.ts'

test('every SKILL.md in engine/skills parses and only uses registered tools', () => {
  assert.deepEqual([...skillCatalog.keys()], ['best-price', 'daily-planner', 'email-address', 'email-triage', 'hellonear-guide', 'http-request', 'invoice', 'meeting-prep', 'mind-seller', 'morning-briefing', 'near-account', 'paid-data', 'payments', 'price-watch', 'subscriptions'])
  assert.deepEqual(skillCatalog.get('daily-planner')?.tools, ['get_time', 'add_numbers', 'googlecalendar_list_events', 'googlecalendar_create_event', 'googlecalendar_create_meeting', 'googlecalendar_block_time'])
  assert.deepEqual(skillCatalog.get('daily-planner')?.connections, ['googlecalendar', 'googlemeet'])
  assert.equal(skillCatalog.get('payments')?.status, 'available')
  assert.deepEqual(skillCatalog.get('payments')?.tools, ['send_payment', 'get_balance', 'list_payments', 'get_time', 'near_view_account'])
  assert.equal(skillCatalog.get('email-triage')?.status, 'available')
  assert.deepEqual(skillCatalog.get('email-triage')?.tools, ['gmail_list_emails', 'gmail_read_email', 'gmail_create_draft', 'gmail_organize', 'get_time'])
  assert.equal(skillCatalog.get('daily-planner')?.skill.name, 'daily-planner')
})

test('commerce skills (#176, #179, #180, #181): buying and selling wait for approval, invoicing never pays', async () => {
  const { needsApproval } = await import('../src/tools.ts')
  assert.deepEqual(skillCatalog.get('best-price')?.tools, ['get_quotes', 'buy_data', 'send_payment', 'list_payments', 'get_time'])
  assert.deepEqual(skillCatalog.get('price-watch')?.tools, ['get_quotes', 'buy_data', 'send_payment', 'add_numbers', 'get_time'])
  const invoice = skillCatalog.get('invoice')!
  assert.deepEqual(invoice.tools, ['mail_send', 'mail_list', 'mail_read', 'get_balance', 'near_check_transfer', 'get_time'])
  assert.ok(!invoice.tools.includes('send_payment'), 'an invoice never sends money')
  assert.deepEqual(skillCatalog.get('mind-seller')?.tools, ['sell_offer', 'buy_from_mind', 'send_payment', 'get_balance', 'get_time'])
  for (const id of ['best-price', 'price-watch', 'invoice', 'mind-seller']) {
    const s = skillCatalog.get(id)!
    assert.equal(s.status, 'available')
    assert.ok(s.blurb && s.title, id)
    // Every tool that moves money or sends mail is an approval tool.
    for (const t of s.tools.filter((t) => ['send_payment', 'mail_send', 'sell_offer'].includes(t))) assert.equal(needsApproval(t), true, t)
    assert.ok(!/intents/i.test(s.blurb ?? ''), 'never claims NEAR Intents')
  }
})

test('shared references load into the skill for skill_read, once per file, reused by several skills', () => {
  const payments = skillCatalog.get('payments')!
  const lookup = skillCatalog.get('near-account')!
  assert.deepEqual(payments.references, ['near-recipients.md'])
  const text = (payments.skill as unknown as { __referenceContents: Record<string, string> }).__referenceContents['near-recipients.md']
  assert.match(text, /UNKNOWN_ACCOUNT/)
  assert.equal((lookup.skill as unknown as { __referenceContents: Record<string, string> }).__referenceContents['near-recipients.md'], text)
  const md = (refs: string) => `---\nname: t\ndescription: d\nmetadata:\n  hellonear:\n    tools: []\n    connections: []\n    status: available\n    references: ${refs}\n---\n# Body\n`
  assert.throws(() => parseSkillMd(md('[../secrets.md]'), 't', () => ''), /Invalid|regex|string/i)
  assert.throws(() => parseSkillMd(md('[missing.md]'), 't'), /ENOENT/)
})

test('blocked and unknown skills are never usable', () => {
  // No catalog skill is blocked right now, so add one for this test only.
  skillCatalog.set('test-blocked', parseSkillMd(`---\nname: test-blocked\ndescription: d\nmetadata:\n  hellonear:\n    tools: [get_time]\n    connections: []\n    status: blocked\n---\n# Body\n`, 'test-blocked'))
  try {
    assert.deepEqual(usableSkills(['daily-planner', 'test-blocked', 'nope']).map((s) => s.name), ['daily-planner'])
  } finally {
    skillCatalog.delete('test-blocked')
  }
})

test('the catalog lists every skill an owner can equip, including ones no template starts with; not the built-in guide (#114)', () => {
  const all = skillCatalogSummaries()
  assert.deepEqual(all.map((s) => s.skillId), [...skillCatalog.keys()].filter((id) => id !== 'hellonear-guide'))
  assert.deepEqual(all.find((s) => s.skillId === 'near-account')?.tools, ['near_view_account'])
  assert.deepEqual(all.find((s) => s.skillId === 'http-request')?.tools, ['http_request'])
  const email = all.find((s) => s.skillId === 'email-triage')!
  assert.equal(email.status, 'available')
  assert.ok(email.note)
})

const md = (fm: string) => `---\n${fm}\n---\n# Body\n`
const good = 'name: demo\ndescription: d\nmetadata:\n  hellonear:\n    tools: [get_time]\n    connections: []\n    status: available'

test('a valid SKILL.md parses into a Mastra skill', () => {
  const s = parseSkillMd(md(good), 'demo')
  assert.equal(s.skill.name, 'demo')
  assert.deepEqual(s.tools, ['get_time'])
})

test('invalid SKILL.md files are rejected', () => {
  assert.throws(() => parseSkillMd('# no frontmatter', 'demo'), /missing YAML frontmatter/)
  assert.throws(() => parseSkillMd(md(good), 'other'), /must match its folder/)
  assert.throws(() => parseSkillMd(md(good.replace('[get_time]', '[rm_rf]')), 'demo'), /unknown tools rm_rf/)
  assert.throws(() => parseSkillMd(md(good.replace('available', 'live')), 'demo'))
})
