// Unit tests for the verification summary behind the badge (no network).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize } from '../src/verify.ts'

test('incognito models never get a private badge, even with valid signatures', () => {
  assert.deepEqual(summarize(false, [{ id: 'a', ok: true, signatureKind: 'gateway' }]), { status: 'not_applicable', reason: 'incognito_model' })
})

test('no completions means nothing to verify', () => {
  assert.deepEqual(summarize(true, []), { status: 'not_applicable', reason: 'no_completions' })
})

test('model TEE only when every step was signed inside the model TEE', () => {
  assert.equal((summarize(true, [{ id: 'a', ok: true, signatureKind: 'provider_tee' }]) as any).level, 'model_tee')
  assert.equal((summarize(true, [{ id: 'a', ok: true, signatureKind: 'provider_tee' }, { id: 'b', ok: true, signatureKind: 'gateway' }]) as any).level, 'gateway_tee')
})

test('any failed step fails the whole run', () => {
  const v = summarize(true, [{ id: 'a', ok: true, signatureKind: 'provider_tee' }, { id: 'b', ok: false, error: 'api.completion_signature_unavailable' }])
  assert.equal(v.status, 'failed')
  assert.deepEqual((v as any).errors, ['b: api.completion_signature_unavailable'])
})
