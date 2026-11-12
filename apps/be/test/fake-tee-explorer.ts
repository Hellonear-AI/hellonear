// A stand-in for proof.t16z.com's `POST /api/upload` (#277), shaped like its live answer (checked 12 Nov): multipart
// `file` with the quote's bytes, answered `{ success, checksum, url, quote: { verified } }`. Records every upload.
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'

export const fakeTeeExplorer = {
  uploads: [] as { fields: string[]; name: string; type: string; bytes: Buffer }[],
  // Answers the next upload with this instead (an error status, or a body the backend must not trust).
  failNext: null as null | { status: number; body: unknown },
}

export const teeExplorerServer = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  if (req.method !== 'POST' || req.url !== '/api/upload') return send(404, { error: 'not found' })
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const form = await new Request('http://explorer/api/upload', { method: 'POST', headers: { 'content-type': String(req.headers['content-type']) }, body: Buffer.concat(chunks) }).formData()
  const file = form.get('file')
  if (!(file instanceof File)) return send(400, { success: false })
  const bytes = Buffer.from(await file.arrayBuffer())
  fakeTeeExplorer.uploads.push({ fields: [...form.keys()], name: file.name, type: file.type, bytes })
  const fail = fakeTeeExplorer.failNext
  fakeTeeExplorer.failNext = null
  if (fail) return send(fail.status, fail.body)
  const checksum = createHash('sha256').update(bytes).digest('hex')
  send(200, { success: true, checksum, url: `/reports/${checksum}`, quote: { verified: true } })
}).listen(0, '127.0.0.1')
