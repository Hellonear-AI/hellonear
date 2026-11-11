// Unit tests for the skill catalog (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillMd, skillCatalog, skillCatalogSummaries, skillDetail, usableSkills } from '../src/skills.ts'
import { needsApproval } from '../src/tools.ts'

test('every SKILL.md in engine/skills parses and only uses registered tools', () => {
  assert.deepEqual([...skillCatalog.keys()], ['best-price', 'calendar-conflicts', 'confidential-reader', 'daily-planner', 'docs', 'email-address', 'email-triage', 'follow-ups', 'freeze-advisor', 'health-journal', 'hellonear-guide', 'http-request', 'invoice', 'meeting-prep', 'mind-seller', 'morning-briefing', 'near-account', 'notion', 'outlook', 'paid-data', 'payments', 'phishing-detector', 'price-watch', 'recipient-guard', 'redact-before-send', 'revenue-split', 'sheets', 'slack', 'spending-audit', 'spending-tracker', 'split-bill', 'subscriptions', 'treasury-report'])
  assert.deepEqual(skillCatalog.get('daily-planner')?.tools, ['get_time', 'add_numbers', 'googlecalendar_list_events', 'googlecalendar_create_event', 'googlecalendar_create_meeting', 'googlecalendar_block_time', 'googlecalendar_find_free_time', 'googlecalendar_move_event'])
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

test('wallet skills grant only the wallet tools they need; read-only ones can never pay (#177, #182, #184, #185, #189, #190)', () => {
  assert.deepEqual(skillCatalog.get('recipient-guard')?.tools, ['near_view_account', 'list_payments', 'send_payment', 'get_balance', 'get_time'])
  assert.deepEqual(skillCatalog.get('recipient-guard')?.references, ['near-recipients.md'])
  assert.deepEqual(skillCatalog.get('split-bill')?.tools, ['add_numbers', 'split_amount', 'send_payment', 'near_view_account', 'list_payments', 'get_balance', 'get_time'])
  assert.deepEqual(skillCatalog.get('revenue-split')?.tools, ['get_balance', 'send_payment', 'near_view_account', 'add_numbers', 'split_amount', 'list_payments', 'get_time'])
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

test('catalog items carry the title and blurb people see, plus every field they had before (#220)', () => {
  for (const s of skillCatalogSummaries()) {
    assert.ok(s.title && s.blurb, `${s.skillId} has a title and a blurb`)
    assert.ok(s.description && s.status && Array.isArray(s.connections) && Array.isArray(s.tools), `${s.skillId} keeps its old fields`)
  }
  assert.deepEqual(skillCatalogSummaries().find((s) => s.skillId === 'near-account'), {
    skillId: 'near-account', description: skillCatalog.get('near-account')!.description, status: 'available', connections: [],
    title: 'NEAR account lookup', blurb: 'looks up NEAR testnet accounts, cannot spend', tools: ['near_view_account'],
  })
})

test('a skill detail is its SKILL.md body without the frontmatter; unknown and built-in skills have none (#220)', () => {
  const d = skillDetail('near-account')!
  assert.deepEqual(Object.keys(d), ['skillId', 'title', 'blurb', 'status', 'connections', 'tools', 'markdown'])
  assert.deepEqual([d.title, d.status, d.tools], ['NEAR account lookup', 'available', ['near_view_account']])
  assert.match(d.markdown, /^# NEAR account\n/)
  for (const s of skillCatalogSummaries()) {
    const markdown = skillDetail(s.skillId)!.markdown
    assert.ok(markdown.length > 0 && !markdown.startsWith('---') && !/^metadata:|^\s+hellonear:/m.test(markdown), `${s.skillId} has no frontmatter`)
  }
  assert.equal(skillDetail('nope'), undefined)
  assert.equal(skillDetail('hellonear-guide'), undefined, 'built-in skills are not offered')
  assert.ok(skillCatalog.get('hellonear-guide')?.builtin)
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

test('mail skills grant only the tools their playbooks need (#183, #186, #187, #188, #191, #193)', () => {
  const tools = (id: string) => skillCatalog.get(id)?.tools
  // The Mind's own inbox tools come only with the Email address skill: without it, mail_list errored on every check (11 Nov).
  assert.deepEqual(tools('phishing-detector'), ['gmail_list_emails', 'gmail_read_email', 'gmail_organize'])
  assert.deepEqual(tools('confidential-reader'), ['gmail_list_emails', 'gmail_read_email'])
  assert.deepEqual(tools('redact-before-send'), ['mail_send', 'http_request'])
  assert.deepEqual(tools('health-journal'), ['get_time'])
  assert.deepEqual(tools('spending-tracker'), ['get_time', 'gmail_list_emails', 'gmail_read_email', 'add_numbers'])
  assert.deepEqual(tools('follow-ups'), ['get_time', 'gmail_list_emails', 'gmail_read_email', 'gmail_create_draft'])
  // Bill due dates extend the subscription tracker instead of a second skill over the same emails (#193).
  assert.deepEqual(tools('subscriptions'), ['get_time', 'gmail_list_emails', 'gmail_read_email', 'add_numbers', 'googlecalendar_create_event'])
  assert.equal(skillCatalog.get('subscriptions')?.title, 'Subscriptions & bills')
  // Reading and drafting skills never pay or send.
  for (const id of ['phishing-detector', 'confidential-reader', 'health-journal', 'spending-tracker', 'follow-ups', 'subscriptions']) {
    assert.ok(!tools(id)!.some((t) => ['send_payment', 'mail_send'].includes(t)), id)
  }
  for (const id of ['phishing-detector', 'confidential-reader', 'redact-before-send', 'health-journal', 'spending-tracker', 'follow-ups']) {
    const s = skillCatalog.get(id)!
    assert.equal(s.status, 'available', id)
    assert.ok(s.title && s.blurb && s.note, id)
  }
})

test('one small skill per connected app (#194): its own tools and connection, writes behind approval', () => {
  const apps: Record<string, [string[], string[]]> = {
    sheets: [['add_numbers', 'googlesheets_find_spreadsheets', 'googlesheets_read_range', 'googlesheets_append_row', 'googlesheets_update_cells'], ['googlesheets']],
    docs: [['googledrive_find_files', 'googledocs_read_document', 'googledocs_create_document'], ['googledrive', 'googledocs']],
    slack: [['slack_list_channels', 'slack_send_message'], ['slack']],
    notion: [['notion_search', 'notion_read_page', 'notion_create_page', 'notion_add_row'], ['notion']],
    outlook: [['outlook_list_emails', 'outlook_read_email', 'outlook_create_draft'], ['outlook']],
  }
  for (const [id, [tools, connections]] of Object.entries(apps)) {
    const s = skillCatalog.get(id)!
    assert.deepEqual([s.tools, s.connections, s.status], [tools, connections, 'available'], id)
    assert.ok(s.title && s.blurb, id)
  }
  for (const t of ['googlesheets_append_row', 'googlesheets_update_cells', 'googledocs_create_document', 'slack_send_message', 'notion_create_page', 'notion_add_row']) assert.equal(needsApproval(t), true, t)
  // Outlook is drafts only, like Gmail: none of its tools sends.
  assert.ok(!skillCatalog.get('outlook')!.tools.some((t) => needsApproval(t) || /send/.test(t)))
})

test('calendar-conflicts (#192, #247): reads the calendar and free time; its writes (a buffer, a move) wait for approval', () => {
  const s = skillCatalog.get('calendar-conflicts')!
  assert.deepEqual([s.tools, s.connections, s.status], [['get_time', 'googlecalendar_list_events', 'googlecalendar_create_event', 'googlecalendar_find_free_time', 'googlecalendar_move_event'], ['googlecalendar'], 'available'])
  assert.ok(s.title && s.blurb)
  assert.equal(needsApproval('googlecalendar_create_event'), true)
  assert.equal(needsApproval('googlecalendar_move_event'), true)
  assert.equal(needsApproval('googlecalendar_find_free_time'), false)
})
