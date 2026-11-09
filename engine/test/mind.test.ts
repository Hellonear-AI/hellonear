// The system prompt built from a Mind's config. No network, LLM or database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WRITING_STYLE_RULE, buildInstructions, mindSchema, resourceId } from '../src/mind.ts'

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
