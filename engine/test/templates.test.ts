// Unit tests for the template catalog (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { templateSummaries, templates } from '../src/templates.ts'

test('the three starter templates load and reference known skills', () => {
  assert.deepEqual(templates.map((t) => t.templateId), ['email-manager', 'general-assistant', 'payments-mind'])
  for (const t of templates) assert.ok(t.soul.invariants.length > 0, `${t.templateId} has guardrails`)
})

test('summaries expose skill status and connections for the UI', () => {
  const email = templateSummaries().find((t) => t.templateId === 'email-manager')!
  const triage = email.skills.find((s) => s.skillId === 'email-triage')!
  assert.equal(triage.status, 'available')
  assert.deepEqual(triage.connections, ['gmail'])
  assert.ok(triage.note)
  const pay = templateSummaries().find((t) => t.templateId === 'payments-mind')!.skills[0]
  assert.equal(pay.status, 'available')
  assert.equal(pay.note, undefined)
})
