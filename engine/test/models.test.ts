// Reasoning effort per model (#92). Needs engine/.env (config reads it), no network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withReasoningEffort } from '../src/models.ts'

test('GLM-5.3 Flash is asked for low reasoning', () => {
  assert.equal(withReasoningEffort({ model: 'z-ai/glm-5.3-flash', messages: [] }).reasoning_effort, 'low')
})

test('a call that sets its own reasoning effort keeps it', () => {
  assert.equal(withReasoningEffort({ model: 'z-ai/glm-5.3-flash', reasoning_effort: 'medium' }).reasoning_effort, 'medium')
})

test('other models are left alone', () => {
  const body = { model: 'Qwen/Qwen3.6-35B-A3B-FP8', messages: [] }
  assert.equal(withReasoningEffort(body), body)
  assert.equal('reasoning_effort' in withReasoningEffort(body), false)
})
