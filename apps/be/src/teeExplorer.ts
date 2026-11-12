// TEE Explorer reports (#277): "Open in TEE Explorer" opens https://proof.t16z.com with the run's Intel quote already
// checked. The Explorer has no URL that fills in a quote and sends no CORS headers, so the backend uploads the quote's
// bytes to its own `POST /api/upload` (multipart `file`, what its Verify button sends) and returns the report page.
// Only the quote leaves: never the steps, signed text or anything from the conversation. One upload per quote: the
// report's checksum is kept in `tee_explorer_reports`. An uploaded report shows in the Explorer's public
// "Recent attestations" list, as if the owner had pasted it.
import { createHash } from 'node:crypto'
import { config } from './config.ts'
import { query } from './db.ts'
import { HttpError, UPSTREAM_ERROR, fetchFailure } from './http.ts'
import type { RunProof } from './runs.ts'

export type ExplorerReport = { attestation: string; url: string; verified: boolean }

const TIMEOUT_MS = 20_000
const CHECKSUM = /^[0-9a-f]{64}$/
const HEX = /^(?:0x)?((?:[0-9a-fA-F]{2})+)$/

const reportUrl = (checksum: string) => `${config.teeExplorerUrl}/reports/${checksum}`

// The quotes a run's proofs carry, one per attestation (a run paused for approval repeats them across its parts).
function quotesOf(proofs: RunProof[]): { attestation: string; bytes: Buffer }[] {
  const seen = new Map<string, Buffer>()
  for (const { proof } of proofs) {
    const attestations = (proof as { attestations?: Record<string, { intelQuote?: unknown }> } | null)?.attestations
    if (!attestations || typeof attestations !== 'object') continue
    for (const [attestation, a] of Object.entries(attestations)) {
      const hex = typeof a?.intelQuote === 'string' ? HEX.exec(a.intelQuote.trim()) : null
      if (hex && !seen.has(attestation)) seen.set(attestation, Buffer.from(hex[1], 'hex'))
    }
  }
  return [...seen].map(([attestation, bytes]) => ({ attestation, bytes }))
}

async function upload(bytes: Buffer): Promise<{ checksum: string; verified: boolean }> {
  const form = new FormData()
  form.append('file', new File([new Uint8Array(bytes)], 'quote.bin', { type: 'application/octet-stream' }))
  let res: Response
  try {
    res = await fetch(`${config.teeExplorerUrl}/api/upload`, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    throw new HttpError(UPSTREAM_ERROR, 'tee_explorer_unreachable', { reason: fetchFailure(e) })
  }
  const body = (await res.json().catch(() => null)) as { success?: unknown; checksum?: unknown; quote?: { verified?: unknown } } | null
  const checksum = typeof body?.checksum === 'string' ? body.checksum.toLowerCase() : ''
  // The report URL is built from the checksum, never taken from the answer.
  if (!res.ok || body?.success !== true || !CHECKSUM.test(checksum)) throw new HttpError(UPSTREAM_ERROR, 'tee_explorer_error', { status: res.status })
  return { checksum, verified: body.quote?.verified === true }
}

export async function explorerReports(proofs: RunProof[]): Promise<ExplorerReport[]> {
  const quotes = quotesOf(proofs)
  if (!quotes.length) throw new HttpError(404, 'no_quote')
  const reports: ExplorerReport[] = []
  for (const { attestation, bytes } of quotes) {
    const hash = createHash('sha256').update(bytes).digest('hex')
    let [row] = await query('select checksum, verified from tee_explorer_reports where quote_sha256 = $1', [hash])
    if (!row) {
      row = await upload(bytes)
      await query('insert into tee_explorer_reports (quote_sha256, checksum, verified) values ($1, $2, $3) on conflict do nothing', [hash, row.checksum, row.verified])
    }
    reports.push({ attestation, url: reportUrl(row.checksum), verified: row.verified })
  }
  return reports
}
