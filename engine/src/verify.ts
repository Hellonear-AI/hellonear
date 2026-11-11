// "Verified private" badge (#19). Pure functions; the NEAR AI SDK does the cryptography.
//
// Measured on 3 Nov 2026 with @nearai/inference-sdk 0.2.1 and z-ai/glm-5.3-flash:
//   non-streaming → signatureKind "provider_tee" (signed inside the model TEE)
//   streaming     → signatureKind "gateway"      (signed inside the Gateway TEE; does not by
//                                                 itself prove the model ran in a TEE)
// Incognito models (Claude, GPT, …) are never "private", whatever the signature says.

export type SignatureKind = 'provider_tee' | 'gateway'

// What the engine checked, kept so the owner can see the evidence behind the badge (#254). Everything comes from the
// SDK's own verification of the step (`verifyResponse`); nothing is fetched again and no API key is involved.
// `signedText` is `{request_hash}:{response_hash}` (gateway) or `{model}:{request_hash}:{response_hash}` (model TEE):
// hashes only, never the conversation (near-ai-cloud skill, chat-verification).
export type Signer = { algo: string; address: string }
export type StepProof = { id: string; signatureKind: SignatureKind; signer: Signer; signedText: string; signature: string; attestation: string }
// One per attested signer (a run's steps usually share one): the Intel TDX quote and nonce anyone can check again,
// e.g. at https://proof.t16z.com, and what the SDK established from them.
export type AttestationProof = {
  kind: 'gateway' | 'model'
  signer: Signer
  nonce: string
  intelQuote: string
  tcbStatus: string
  // Model TEEs only: whether NVIDIA evidence was supplied and verified (`not_provided` when the CVM gave none).
  gpuEvidence?: string
  composeHash?: string
  osImageHash?: string
}
export type Proof = { checkedAt: string; steps: StepProof[]; attestations: Record<string, AttestationProof> }

export type StepResult =
  | { id: string; ok: true; signatureKind: SignatureKind; proof?: { step: StepProof; attestation: AttestationProof } }
  | { id: string; ok: false; error: string }

export type Verification =
  | { status: 'not_applicable'; reason: 'incognito_model' | 'no_completions' }
  | { status: 'verified'; level: 'model_tee' | 'gateway_tee'; completionIds: string[]; proof?: Proof }
  | { status: 'failed'; completionIds: string[]; errors: string[] }

export function summarize(verifiable: boolean, steps: StepResult[]): Verification {
  if (!verifiable) return { status: 'not_applicable', reason: 'incognito_model' }
  if (!steps.length) return { status: 'not_applicable', reason: 'no_completions' }
  const completionIds = steps.map((s) => s.id)
  const failed = steps.filter((s): s is Extract<StepResult, { ok: false }> => !s.ok)
  if (failed.length) return { status: 'failed', completionIds, errors: failed.map((f) => `${f.id}: ${f.error}`) }
  // The badge is only as strong as the weakest step.
  const allModelTee = steps.every((s) => s.ok && s.signatureKind === 'provider_tee')
  const proof = proofOf(steps)
  return { status: 'verified', level: allModelTee ? 'model_tee' : 'gateway_tee', completionIds, ...(proof ? { proof } : {}) }
}

// The proof only when every step carried its evidence, so it never shows a partial picture of the badge.
export function proofOf(steps: StepResult[], now = new Date()): Proof | undefined {
  const parts = steps.map((s) => (s.ok ? s.proof : undefined))
  if (!parts.length || parts.some((p) => !p)) return undefined
  const attestations: Record<string, AttestationProof> = {}
  for (const p of parts) attestations[p!.step.attestation] = p!.attestation
  return { checkedAt: now.toISOString(), steps: parts.map((p) => p!.step), attestations }
}

// The evidence of one verified step (#254), from the SDK's result: the signature and the attestation it matched.
// Defensive about shapes (SDK 0.2.x types): a missing field leaves the proof out rather than failing the badge.
type VerifiedLike = { id: string; signatureKind: 'provider_tee' | 'gateway'; signature?: { signer?: { signingAlgo?: string; signingAddress?: string }; signedText?: string; signature?: string }; attestation?: { signer?: { signingAlgo?: string; signingAddress?: string }; tcbStatus?: string; gpuEvidence?: string; deployment?: { runtimeMeasurements?: { composeHash?: string; osImageHash?: string } }; report?: { nonce?: string; intelQuote?: string } } }
export function stepProof(v: VerifiedLike): { step: StepProof; attestation: AttestationProof } | undefined {
  const sig = v.signature
  const att = v.attestation
  const address = att?.signer?.signingAddress
  if (!sig?.signedText || !sig.signature || !sig.signer?.signingAddress || !address || !att?.report?.intelQuote || !att.report.nonce) return undefined
  const kind = v.signatureKind === 'provider_tee' ? 'model' : 'gateway'
  return {
    step: { id: v.id, signatureKind: v.signatureKind, signer: { algo: sig.signer.signingAlgo ?? '', address: sig.signer.signingAddress }, signedText: sig.signedText, signature: sig.signature, attestation: `${kind}:${address}` },
    attestation: {
      kind,
      signer: { algo: att.signer?.signingAlgo ?? '', address },
      nonce: att.report.nonce,
      intelQuote: att.report.intelQuote,
      tcbStatus: att.tcbStatus ?? 'Unknown',
      ...(att.gpuEvidence ? { gpuEvidence: att.gpuEvidence } : {}),
      ...(att.deployment?.runtimeMeasurements?.composeHash ? { composeHash: att.deployment.runtimeMeasurements.composeHash } : {}),
      ...(att.deployment?.runtimeMeasurements?.osImageHash ? { osImageHash: att.deployment.runtimeMeasurements.osImageHash } : {}),
    },
  }
}
