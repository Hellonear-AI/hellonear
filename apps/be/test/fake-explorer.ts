// A stand-in for Phala's TEE Attestation Explorer upload (#277): `POST /api/upload` with a multipart `file`, answered
// like proof.t16z.com did on 12 Nov (`success`, `checksum`, `quote.verified`). Every upload is kept, with its bytes.
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'

export const fakeExplorer = { uploads: [] as Buffer[], down: false }

export const explorerServer = createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  if (fakeExplorer.down) return res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"down"}')
  if (req.method !== 'POST' || req.url !== '/api/upload') return res.writeHead(404).end()
  const form = await new Request('http://x', { method: 'POST', headers: { 'content-type': req.headers['content-type'] ?? '' }, body: Buffer.concat(chunks) }).formData()
  const file = form.get('file')
  if (!(file instanceof Blob)) return res.writeHead(400, { 'content-type': 'application/json' }).end('{"success":false}')
  const bytes = Buffer.from(await file.arrayBuffer())
  fakeExplorer.uploads.push(bytes)
  const checksum = createHash('sha256').update(bytes).digest('hex')
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: checksum, success: true, checksum, quote: { verified: true } }))
})
