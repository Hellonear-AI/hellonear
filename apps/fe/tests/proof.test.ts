import { describe, expect, it } from "vitest"
import { checkedSteps, replyProof, shortHex, tcbText, type Proof } from "@/modules/runs/data/proof"

const proof: Proof = {
  checkedAt: "2026-11-11T08:00:00Z",
  steps: [
    { id: "chatcmpl-1", signatureKind: "gateway", signer: { algo: "ecdsa", address: "0xAbC123" }, signedText: "a:b", signature: "0xsig", attestation: "gateway:0xabc123" },
    { id: "chatcmpl-2", signatureKind: "gateway", signer: { algo: "ecdsa", address: "0xdead" }, signedText: "c:d", signature: "0xsig2", attestation: "gateway:0xabc123" },
  ],
  attestations: { "gateway:0xabc123": { kind: "gateway", signer: { algo: "ecdsa", address: "0xabc123" }, nonce: "ff", intelQuote: "0400", tcbStatus: "UpToDate" } },
}

describe("the proof behind the badge (#254)", () => {
  it("checks each step's signer against its attestation's, ignoring case", () => {
    expect(checkedSteps(proof).map((s) => s.matches)).toEqual([true, false])
  })
  it("takes the reply's proof, the last part of a paused run", () => {
    const p = (seq: number) => ({ seq, model: "m", level: "gateway_tee", proof })
    expect(replyProof({ runId: "r", proofs: [p(4), p(9)] })?.seq).toBe(9)
    expect(replyProof(undefined)).toBeNull()
  })
  it("words Intel's status plainly and shortens hex", () => {
    expect(tcbText("UpToDate")).toEqual({ text: "Up to date", ok: true })
    expect(tcbText("OutOfDate")).toEqual({ text: "Out Of Date", ok: false })
    expect(tcbText("")).toEqual({ text: "Not reported", ok: false })
    expect(shortHex("0x1234567890abcdef1234")).toBe("0x1234…ef1234")
  })
})
