// The system prompt built from a Mind's config. No network, LLM or database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LANGUAGE_RULE, SMALL_TALK_RULE, WRITING_STYLE_RULE, buildInstructions, mindSchema, resourceId, skillsLine } from '../src/mind.ts'

test('every Mind is told not to use em or en dashes', () => {
  for (const templateId of ['payments-mind', 'email-manager', 'general-assistant']) {
    const mind = mindSchema.parse({ templateId, name: 'Penny', soul: { identity: 'You help.' } })
    assert.ok(buildInstructions(mind).includes(WRITING_STYLE_RULE))
  }
})

test('the rule itself names both dashes and the replacements', () => {
  assert.match(WRITING_STYLE_RULE, /—/)
  assert.match(WRITING_STYLE_RULE, /–/)
  assert.match(WRITING_STYLE_RULE, /comma/)
})

test('memory is keyed per persona version once the name or soul changed (#116)', () => {
  assert.equal(resourceId('usr_1', 'mnd_1'), 'usr_1:mnd_1')
  assert.equal(resourceId('usr_1', 'mnd_1', 0), 'usr_1:mnd_1', 'never renamed: the same memory as before')
  assert.equal(resourceId('usr_1', 'mnd_1', 2), 'usr_1:mnd_1:v2')
  assert.equal(mindSchema.parse({ templateId: 't', name: 'Rex', soul: { identity: 'x' }, personaVersion: 1 }).personaVersion, 1)
  assert.throws(() => mindSchema.parse({ templateId: 't', name: 'Rex', soul: { identity: 'x' }, personaVersion: -1 }))
})

test('a Mind knows its skills and what it could add, by the names people see (#114)', () => {
  const line = skillsLine(['payments', 'daily-planner'])
  assert.match(line, /Your skills, what you can do right now: Payments \(.*\); Daily planner \(/)
  assert.match(line, /can add them on the Skills screen: .*Email helper \(reads the owner's Gmail, saves drafts and tidies the inbox when you approve, never sends\)/)
  assert.match(line, /Email address \(gives this Mind its own email address and sends email/)
  assert.ok(!/HelloNear guide/.test(line), 'the built-in guide is not a skill to add')
  assert.ok(!/can add.*Payments/.test(line), 'equipped skills are not offered again')
  assert.match(skillsLine([]), /Your skills, what you can do right now: none yet\./)
  // Skills to add are never described as the Mind's own (10 Nov: 7 of 10 replies did).
  assert.match(line, /Not yours yet; the owner can add them on the Skills screen/)
  assert.match(line, /describe only your own skills\. Never present a skill you do not have as something you can do/)
})

test('the owner\'s time zone goes into the prompt with its offset (#124)', () => {
  const mind = mindSchema.parse({ templateId: 't', name: 'Tz', soul: { identity: 'x' } })
  assert.match(buildInstructions(mind, { timeZone: 'Asia/Jakarta' }), /Asia\/Jakarta \(UTC\+07:00 now\)/)
  assert.ok(!/time zone is/.test(buildInstructions(mind)), 'no zone, no line')
})

test('every Mind answers greetings and small talk without tools, and still calls them when asked (#205)', () => {
  for (const templateId of ['payments-mind', 'email-manager', 'general-assistant']) {
    const mind = mindSchema.parse({ templateId, name: 'Penny', soul: { identity: 'You help.' } })
    assert.ok(buildInstructions(mind).includes(SMALL_TALK_RULE))
  }
  assert.match(SMALL_TALK_RULE, /"halo"/)
  assert.match(SMALL_TALK_RULE, /no tool calls: do not load a skill, check the time, read the calendar or inbox, or update your memory/)
  // Real requests still get their tools: "what time is it", "plan my day", a payment.
  assert.match(SMALL_TALK_RULE, /Call a tool only when the message asks for something that tool does \(the time, the calendar, a plan for the day, a payment\)/)
})

test('every Mind replies in the owner\'s language with standard spelling, KBBI words for Indonesian (#205)', () => {
  const mind = mindSchema.parse({ templateId: 'payments-mind', name: 'Penny', soul: { identity: 'You help.' } })
  const prompt = buildInstructions(mind)
  assert.ok(prompt.includes(LANGUAGE_RULE))
  assert.match(LANGUAGE_RULE, /language of the owner's last message/)
  assert.match(LANGUAGE_RULE, /never invent words/)
  assert.match(LANGUAGE_RULE, /KBBI/)
  assert.match(LANGUAGE_RULE, /short and simple/)
  // Both house rules sit with the writing style rule, before the skills line.
  assert.ok(prompt.indexOf(LANGUAGE_RULE) < prompt.indexOf('Your skills') && prompt.indexOf(SMALL_TALK_RULE) < prompt.indexOf('Your skills'))
})
