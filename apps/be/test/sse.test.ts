// Offline unit tests for the engine SSE parser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sseEvents } from '../src/sse.ts'

async function collect(chunks: string[]) {
  async function* body() { for (const c of chunks) yield new TextEncoder().encode(c) }
  const out = []
  for await (const e of sseEvents(body())) out.push(e)
  return out
}

test('events split at any byte arrive whole and in order', async () => {
  const text = [1, 2, 3].map((seq) => `data: ${JSON.stringify({ seq, text: 'héllo 👋' })}\n\n`).join('')
  for (let size = 1; size <= 7; size++) {
    const chunks: string[] = []
    // Split the UTF-8 bytes, not the string, so multi-byte characters are cut too.
    const bytes = Buffer.from(text)
    for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size).toString('latin1'))
    async function* body() { for (const c of chunks) yield Buffer.from(c, 'latin1') }
    const out: Record<string, any>[] = []
    for await (const e of sseEvents(body())) out.push(e)
    assert.deepEqual(out.map((e) => e.seq), [1, 2, 3], `chunk size ${size}`)
    assert.equal(out[0].text, 'héllo 👋')
  }
})

test('comments and blank lines are ignored; a last event without a newline is kept', async () => {
  assert.deepEqual(await collect([': ping\n\n', 'data: {"a":1}\r\n\r\n', 'data: {"b":2}']), [{ a: 1 }, { b: 2 }])
})
