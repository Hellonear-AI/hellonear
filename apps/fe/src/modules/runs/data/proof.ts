// The proof behind the verified badge (#254): what the engine checked for each model step, kept on
// `run.verified` (#256) and served by `GET /runs/{runId}/proof` (#257). docs/api-contract.md §3, §7.

export type ProofSigner = { algo: string; address: string }

export type StepProof = {
  id: string
  /** "gateway" for a streamed step (signed in the NEAR AI gateway's TEE), "provider_tee" inside the model's. */
  signatureKind: string
  signer: ProofSigner
  /** Hashes only: `{request_hash}:{response_hash}`, never the conversation. */
  signedText: string
  signature: string
  /** The key of the attestation whose signer signed this step. */
  attestation: string
}

export type AttestationProof = {
  kind: "gateway" | "model"
  signer: ProofSigner
  nonce: string
  /** The Intel TDX quote, which anyone can check at proof.t16z.com. */
  intelQuote: string
  tcbStatus: string
  /** NVIDIA's GPU evidence: only where the model itself runs in the TEE. */
  gpuEvidence?: string
  composeHash?: string
  osImageHash?: string
}

export type Proof = { checkedAt: string; steps: StepProof[]; attestations: Record<string, AttestationProof> }

export type RunProofs = { runId: string; proofs: { seq: number; model: string; level: string; proof: Proof }[] }

export const TEE_EXPLORER_URL = "https://proof.t16z.com"

/** The reply's proof: a run paused for approval has one per part, and the last is the reply's. */
export const replyProof = (r: RunProofs | undefined) => r?.proofs.at(-1) ?? null

/** Each step with whether its signer is the attested one, the check the badge rests on. */
export function checkedSteps(proof: Proof) {
  return proof.steps.map((s) => {
    const att = proof.attestations[s.attestation]
    return { step: s, attestation: att ?? null, matches: Boolean(att) && att.signer.address.toLowerCase() === s.signer.address.toLowerCase() }
  })
}

/** Intel's TCB status in plain words; "UpToDate" is the one with nothing to patch. */
export function tcbText(status: string): { text: string; ok: boolean } {
  if (status === "UpToDate") return { text: "Up to date", ok: true }
  if (!status || status === "Unknown") return { text: "Not reported", ok: false }
  return { text: status.replace(/([a-z])([A-Z])/g, "$1 $2"), ok: false }
}

/** "0x1234…cdef": enough of an address or hash to tell two apart. */
export const shortHex = (v: string, keep = 6) => (v.length > keep * 2 + 3 ? `${v.slice(0, keep)}…${v.slice(-keep)}` : v)
