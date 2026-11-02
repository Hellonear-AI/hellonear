// "Verified private" badge (#19). Pure functions; the NEAR AI SDK does the cryptography.
//
// Measured on 3 Nov 2026 with @nearai/inference-sdk 0.2.1 and z-ai/glm-5.3-flash:
//   non-streaming → signatureKind "provider_tee" (signed inside the model TEE)
//   streaming     → signatureKind "gateway"      (signed inside the Gateway TEE; does not by
//                                                 itself prove the model ran in a TEE)
// Incognito models (Claude, GPT, …) are never "private", whatever the signature says.

export type SignatureKind = 'provider_tee' | 'gateway'
export type StepResult = { id: string; ok: true; signatureKind: SignatureKind } | { id: string; ok: false; error: string }

export type Verification =
  | { status: 'not_applicable'; reason: 'incognito_model' | 'no_completions' }
  | { status: 'verified'; level: 'model_tee' | 'gateway_tee'; completionIds: string[] }
  | { status: 'failed'; completionIds: string[]; errors: string[] }

export function summarize(verifiable: boolean, steps: StepResult[]): Verification {
  if (!verifiable) return { status: 'not_applicable', reason: 'incognito_model' }
  if (!steps.length) return { status: 'not_applicable', reason: 'no_completions' }
  const completionIds = steps.map((s) => s.id)
  const failed = steps.filter((s): s is Extract<StepResult, { ok: false }> => !s.ok)
  if (failed.length) return { status: 'failed', completionIds, errors: failed.map((f) => `${f.id}: ${f.error}`) }
  // The badge is only as strong as the weakest step.
  const allModelTee = steps.every((s) => s.ok && s.signatureKind === 'provider_tee')
  return { status: 'verified', level: allModelTee ? 'model_tee' : 'gateway_tee', completionIds }
}
