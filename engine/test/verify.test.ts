// Unit tests for the verification summary behind the badge (no network).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proofOf, stepProof, summarize } from '../src/verify.ts'

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

// #254: the evidence behind the badge, from the SDK's verified result.
const sdkResult = (id: string, address = '0xAbC') => ({
  id, signatureKind: 'gateway' as const,
  signature: { kind: 'gateway', signer: { signingAlgo: 'ecdsa', signingAddress: address }, signedText: `${'a'.repeat(64)}:${'b'.repeat(64)}`, signature: '0xsig' },
  attestation: { signer: { signingAlgo: 'ecdsa', signingAddress: address }, tcbStatus: 'UpToDate', deployment: { runtimeMeasurements: { composeHash: 'c1', osImageHash: 'o1' } }, report: { nonce: 'n'.repeat(64), intelQuote: 'f'.repeat(2000) } },
})

test('a verified run carries its proof: one step per completion, attestations shared by signer', () => {
  const steps = [
    { id: 's1', ok: true as const, signatureKind: 'gateway' as const, proof: stepProof(sdkResult('s1')) },
    { id: 's2', ok: true as const, signatureKind: 'gateway' as const, proof: stepProof(sdkResult('s2')) },
  ]
  const v = summarize(true, steps)
  assert.equal(v.status, 'verified')
  const proof = (v as { proof?: any }).proof
  assert.deepEqual(proof.steps.map((s: any) => [s.id, s.attestation]), [['s1', 'gateway:0xAbC'], ['s2', 'gateway:0xAbC']])
  assert.deepEqual(Object.keys(proof.attestations), ['gateway:0xAbC'])
  assert.deepEqual(proof.attestations['gateway:0xAbC'], { kind: 'gateway', signer: { algo: 'ecdsa', address: '0xAbC' }, nonce: 'n'.repeat(64), intelQuote: 'f'.repeat(2000), tcbStatus: 'UpToDate', composeHash: 'c1', osImageHash: 'o1' })
})

test('no proof unless every step has its evidence; the badge itself is unchanged', () => {
  const partial = summarize(true, [
    { id: 's1', ok: true, signatureKind: 'gateway', proof: stepProof(sdkResult('s1')) },
    { id: 's2', ok: true, signatureKind: 'gateway' },
  ])
  assert.deepEqual(partial, { status: 'verified', level: 'gateway_tee', completionIds: ['s1', 's2'] })
  assert.equal(proofOf([]), undefined)
  // An SDK result missing the quote gives no step proof rather than a broken one.
  const noQuote = sdkResult('s3') as any
  delete noQuote.attestation.report.intelQuote
  assert.equal(stepProof(noQuote), undefined)
})
