// "Paste the quote in TEE Explorer" without the pasting (#277): the run's Intel quote goes to Phala's TEE Attestation
// Explorer through the same upload its own Verify button uses, and the owner gets the report's link, already checked.
// proof.t16z.com has no URL that prefills a quote and its API sends no CORS headers, so the browser can't do this
// itself (read 12 Nov). `POST /api/upload`, multipart `file` = the quote's bytes, answers `{ success, checksum,
// quote: { verified } }`, and the report lives at `/reports/<checksum>` (a live gateway quote came back verified).
// Only the quote is sent: NEAR AI's hardware report and its nonce, never conversation text. An uploaded report shows
// in the Explorer's public "Recent attestations", as it would if the owner pasted it.
import { createHash } from 'node:crypto'
import { HttpError, UPSTREAM_ERROR, fetchFailure } from './http.ts'

// Read per call, not at import, so tests can point it at a fake.
const explorer = () => process.env.TEE_EXPLORER_URL ?? 'https://proof.t16z.com'

export type ExplorerReport = { url: string; verified: boolean }

// One upload per quote and process: a second click, or the same attestation in several runs, reuses the link.
const reports = new Map<string, ExplorerReport>()
export const resetExplorerCache = () => reports.clear()

const HEX = /^(?:[0-9a-fA-F]{2})+$/
// A TDX quote with its certificates is ~5 KB (10 KB of hex); anything far larger is not one.
const MAX_HEX = 64 * 1024

export async function explorerReport(intelQuote: string): Promise<ExplorerReport> {
  if (!HEX.test(intelQuote) || intelQuote.length > MAX_HEX) throw new HttpError(422, 'not_a_quote')
  const key = createHash('sha256').update(intelQuote.toLowerCase()).digest('hex')
  const known = reports.get(key)
  if (known) return known
  const form = new FormData()
  form.append('file', new Blob([Buffer.from(intelQuote, 'hex')], { type: 'application/octet-stream' }), 'quote.bin')
  // Upstream failures answer 503, never 502 (Cloudflare replaces a 502 body with its own page; apps/be/CLAUDE.md).
  let res: Response
  try {
    res = await fetch(`${explorer()}/api/upload`, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(20_000) })
  } catch (e) {
    throw new HttpError(UPSTREAM_ERROR, 'tee_explorer_unreachable', { reason: fetchFailure(e) })
  }
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; checksum?: string; quote?: { verified?: boolean } }
  // The checksum becomes part of a link the app opens, so only a plain hex one is accepted.
  if (!res.ok || !body.success || !/^[0-9a-f]{64}$/.test(body.checksum ?? '')) throw new HttpError(UPSTREAM_ERROR, 'tee_explorer_error', { explorerStatus: res.status })
  const report = { url: `${explorer()}/reports/${body.checksum}`, verified: body.quote?.verified === true }
  reports.set(key, report)
  return report
}

type Attestation = { kind?: string; intelQuote?: string }

// Every attestation with an Intel quote across a run's proofs, each once (a paused run carries one proof per part,
// usually with the same gateway attestation).
export function quotesOf(proofs: { proof: unknown }[]): { attestation: string; kind: string; intelQuote: string }[] {
  const seen = new Map<string, { attestation: string; kind: string; intelQuote: string }>()
  for (const { proof } of proofs) {
    const atts = (proof as { attestations?: Record<string, Attestation> } | null)?.attestations ?? {}
    for (const [attestation, a] of Object.entries(atts)) {
      if (typeof a?.intelQuote === 'string' && !seen.has(attestation)) seen.set(attestation, { attestation, kind: a.kind ?? '', intelQuote: a.intelQuote })
    }
  }
  return [...seen.values()]
}
