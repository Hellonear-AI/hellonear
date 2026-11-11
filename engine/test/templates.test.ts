// Unit tests for the template catalog (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { templateSummaries, templates } from '../src/templates.ts'

test('the three starter templates load and reference known skills', () => {
  assert.deepEqual(templates.map((t) => t.templateId), ['email-manager', 'general-assistant', 'payments-mind'])
  for (const t of templates) assert.ok(t.soul.invariants.length > 0, `${t.templateId} has guardrails`)
})

test('every template has a card quote, and the Payments Mind keeps money facts plain', () => {
  for (const t of templates) assert.ok(t.quote.length > 0 && t.quote.length <= 80, `${t.templateId} quote`)
  const pay = templates.find((t) => t.templateId === 'payments-mind')!
  assert.match(pay.soul.identity, /Keep money facts plain/)
  assert.ok(pay.soul.invariants.includes("Every payment waits for the owner's approval."))
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

test('each template starts with the skills its track shows (#194)', () => {
  const skills = (id: string) => templates.find((t) => t.templateId === id)!.skills
  assert.deepEqual(skills('payments-mind'), ['payments', 'daily-planner', 'recipient-guard', 'split-bill', 'treasury-report', 'spending-audit', 'best-price', 'freeze-advisor'])
  assert.deepEqual(skills('email-manager'), ['email-triage', 'daily-planner', 'phishing-detector', 'follow-ups', 'subscriptions', 'confidential-reader', 'calendar-conflicts'])
  assert.deepEqual(skills('general-assistant'), ['daily-planner', 'calendar-conflicts', 'health-journal', 'redact-before-send'])
})
