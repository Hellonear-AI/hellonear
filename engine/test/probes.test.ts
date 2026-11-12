// NEAR AI checks for the status page against a fake NEAR AI: no network, key or model needed.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { LIMITS, nearAiProbes } from '../src/probes.ts'

let mode: 'ok' | 'chat500' | 'embedEmpty' | 'hang' = 'ok'
const seen: { path: string; auth?: string; body: any }[] = []
let server: Server
let baseUrl = ''

before(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      seen.push({ path: req.url ?? '', auth: req.headers.authorization, body: JSON.parse(raw || '{}') })
      if (mode === 'hang') return // never answers
      if (req.url === '/chat/completions') {
        if (mode === 'chat500') return void res.writeHead(500).end('{}')
        return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }))
      }
      const embedding = mode === 'embedEmpty' ? [] : [0.1, 0.2]
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ embedding }] }))
    })
  })
  await new Promise<void>((r) => server.listen(0, r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => { server.closeAllConnections(); server.close() })

const target = () => ({ baseUrl, apiKey: 'test-key', chatModel: 'z-ai/glm-5.3-flash', embeddingModel: 'Qwen/Qwen3-Embedding-0.6B' })
const byId = (ps: Awaited<ReturnType<typeof nearAiProbes>>) => Object.fromEntries(ps.map((p) => [p.id, p]))

test('both answer: operational, with the key sent only to NEAR AI and the right models', async () => {
  mode = 'ok'; seen.length = 0
  const p = byId(await nearAiProbes(target()))
  assert.equal(p['nearai-chat'].status, 'operational')
  assert.equal(p['nearai-embeddings'].status, 'operational')
  assert.equal(p['nearai-chat'].detail, null)
  assert.ok(seen.every((s) => s.auth === 'Bearer test-key'))
  assert.equal(seen.find((s) => s.path === '/chat/completions')!.body.model, 'z-ai/glm-5.3-flash')
  assert.equal(seen.find((s) => s.path === '/embeddings')!.body.model, 'Qwen/Qwen3-Embedding-0.6B')
})

test('a 500 or an empty embedding is down, and one failing never hides the other', async () => {
  mode = 'chat500'
  let p = byId(await nearAiProbes(target()))
  assert.deepEqual([p['nearai-chat'].status, p['nearai-chat'].detail], ['down', 'Answered HTTP 500.'])
  assert.equal(p['nearai-embeddings'].status, 'operational')
  mode = 'embedEmpty'
  p = byId(await nearAiProbes(target()))
  assert.equal(p['nearai-embeddings'].status, 'down')
  assert.equal(p['nearai-chat'].status, 'operational')
})

test('no answer within the timeout is down, never a hang', async () => {
  mode = 'hang'
  const saved = structuredClone(LIMITS)
  LIMITS.chat.timeoutMs = 200; LIMITS.embeddings.timeoutMs = 200
  try {
    const started = Date.now()
    const p = byId(await nearAiProbes(target()))
    assert.ok(Date.now() - started < 3000)
    assert.deepEqual([p['nearai-chat'].status, p['nearai-chat'].detail], ['down', 'No answer in 0.2 s.'])
    assert.equal(p['nearai-embeddings'].status, 'down')
  } finally {
    Object.assign(LIMITS.chat, saved.chat); Object.assign(LIMITS.embeddings, saved.embeddings)
  }
})
