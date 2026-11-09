// The system prompt built from a Mind's config. No network, LLM or database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WRITING_STYLE_RULE, buildInstructions, mindSchema } from '../src/mind.ts'

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
