// The system prompt built from a Mind's config. No network, LLM or database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WRITING_STYLE_RULE, buildInstructions, mindSchema, skillsLine } from '../src/mind.ts'

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

test('a Mind knows its skills and what it could add, by the names people see (#114)', () => {
  const line = skillsLine(['payments', 'daily-planner'])
  assert.match(line, /Your skills: Payments \(.*\); Daily planner \(/)
  assert.match(line, /can add on the Skills screen: .*Email helper \(reads the owner's Gmail and saves drafts, never sends\)/)
  assert.match(line, /Email address \(gives this Mind its own email address and sends email/)
  assert.ok(!/HelloNear guide/.test(line), 'the built-in guide is not a skill to add')
  assert.ok(!/can add.*Payments/.test(line), 'equipped skills are not offered again')
  assert.match(skillsLine([]), /Your skills: none yet\./)
})
