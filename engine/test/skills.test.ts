// Unit tests for the skill catalog (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillMd, skillCatalog, skillCatalogSummaries, usableSkills } from '../src/skills.ts'

test('every SKILL.md in engine/skills parses and only uses registered tools', () => {
  assert.deepEqual([...skillCatalog.keys()], ['daily-planner', 'email-address', 'email-triage', 'freeze-advisor', 'hellonear-guide', 'http-request', 'meeting-prep', 'morning-briefing', 'near-account', 'paid-data', 'payments', 'recipient-guard', 'revenue-split', 'spending-audit', 'split-bill', 'subscriptions', 'treasury-report'])
  assert.deepEqual(skillCatalog.get('daily-planner')?.tools, ['get_time', 'add_numbers', 'googlecalendar_list_events', 'googlecalendar_create_event', 'googlecalendar_create_meeting', 'googlecalendar_block_time'])
  assert.deepEqual(skillCatalog.get('daily-planner')?.connections, ['googlecalendar', 'googlemeet'])
  assert.equal(skillCatalog.get('payments')?.status, 'available')
  assert.deepEqual(skillCatalog.get('payments')?.tools, ['send_payment', 'get_balance', 'list_payments', 'get_time', 'near_view_account'])
  assert.equal(skillCatalog.get('email-triage')?.status, 'available')
  assert.deepEqual(skillCatalog.get('email-triage')?.tools, ['gmail_list_emails', 'gmail_read_email', 'gmail_create_draft', 'gmail_organize', 'get_time'])
  assert.equal(skillCatalog.get('daily-planner')?.skill.name, 'daily-planner')
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

test('wallet skills grant only the wallet tools they need; read-only ones can never pay (#177, #182, #184, #185, #189, #190)', () => {
  assert.deepEqual(skillCatalog.get('recipient-guard')?.tools, ['near_view_account', 'list_payments', 'send_payment', 'get_balance', 'get_time'])
  assert.deepEqual(skillCatalog.get('recipient-guard')?.references, ['near-recipients.md'])
  assert.deepEqual(skillCatalog.get('split-bill')?.tools, ['add_numbers', 'send_payment', 'near_view_account', 'list_payments', 'get_balance', 'get_time'])
  assert.deepEqual(skillCatalog.get('revenue-split')?.tools, ['get_balance', 'send_payment', 'near_view_account', 'add_numbers', 'list_payments', 'get_time'])
  for (const id of ['freeze-advisor', 'treasury-report', 'spending-audit']) {
    const s = skillCatalog.get(id)!
    assert.ok(!s.tools.includes('send_payment'), `${id} never pays`)
    assert.ok(s.tools.includes('list_payments') && s.tools.includes('get_balance'), id)
  }
  for (const id of ['recipient-guard', 'freeze-advisor', 'split-bill', 'revenue-split', 'treasury-report', 'spending-audit']) {
    const s = skillCatalog.get(id)!
    assert.equal(s.status, 'available')
    assert.deepEqual(s.connections, ['near-wallet'])
    assert.ok(s.title && s.blurb, `${id} has a title and a blurb for the Skills screen`)
  }
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
