// The system prompt built from a Mind's config. No network, LLM or database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WRITING_STYLE_RULE, buildInstructions, mindSchema, ownsResource, resourceId, skillsLine } from '../src/mind.ts'

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

test('a chat is only deleted from the caller\'s own memory of that Mind, any persona version (#207)', () => {
  assert.ok(ownsResource('usr_1:mnd_1', 'usr_1', 'mnd_1'))
  assert.ok(ownsResource('usr_1:mnd_1:v3', 'usr_1', 'mnd_1'))
  assert.ok(!ownsResource('usr_2:mnd_1', 'usr_1', 'mnd_1'), 'another user')
  assert.ok(!ownsResource('usr_1:mnd_2', 'usr_1', 'mnd_1'), 'another Mind')
  assert.ok(!ownsResource('usr_1:mnd_10', 'usr_1', 'mnd_1'), 'a Mind id that only starts the same')
  assert.ok(!ownsResource('usr_1:mnd_1:vx', 'usr_1', 'mnd_1'))
  assert.ok(!ownsResource('usr_1:mnd_1:v', 'usr_1', 'mnd_1'))
  assert.ok(!ownsResource(undefined, 'usr_1', 'mnd_1'))
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
