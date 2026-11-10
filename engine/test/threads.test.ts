// Deleting a chat (#207): DELETE /v1/minds/{mindId}/threads/{threadId} drops the Mastra thread, its messages and
// their semantic-recall embeddings, and nothing of another thread. Local Postgres from docker-compose.
// The first tests need no NEAR AI: messages go straight to Mastra's memory store and the embeddings are written to
// the same pgvector table, with the same metadata, Memory writes for semantic recall (fake vectors).
// The last test embeds through NEAR AI (a few embedding calls, no chat model) and checks real semantic recall.
// Run all: node --env-file=.env --import tsx --test test/threads.test.ts
// Without NEAR AI: add --test-skip-pattern="NEAR AI"
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { server } from '../src/server.ts'
import { mindAgent, storage, vector } from '../src/mastra.ts'
import { resourceId } from '../src/mind.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
// The index Memory creates for the 1024-dimension embedder (Qwen3-Embedding-0.6B), with Memory's own parameters.
const INDEX = 'memory_messages_1024'

const memory = async () => (await mindAgent.getMemory())!

before(async () => {
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await db.connect()
  await vector.createIndex({ indexName: INDEX, dimension: 1024, metadataIndexes: ['thread_id', 'resource_id'] })
})
// Threads the tests leave behind (the kept ones) are removed at the end.
const seeded: string[] = []
after(async () => {
  const store = (await storage.getStore('memory'))!
  for (const threadId of seeded) await store.deleteThread({ threadId })
  await db.end()
  await new Promise<void>((r) => server.close(() => r()))
})

const forget = (mindId: string, threadId: string, body: unknown = {}, headers: Record<string, string> = { 'x-engine-key': key }) =>
  fetch(`${base}/v1/minds/${mindId}/threads/${threadId}`, { method: 'DELETE', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

const count = async (sql: string, id: string) => (await db.query(sql, [id])).rows[0].n as number
const left = async (threadId: string) => ({
  thread: await count('select count(*)::int as n from mastra.mastra_threads where id = $1', threadId),
  messages: await count('select count(*)::int as n from mastra.mastra_messages where thread_id = $1', threadId),
  vectors: await count(`select count(*)::int as n from mastra.${INDEX} where metadata->>'thread_id' = $1`, threadId),
})

// A thread with two messages and one fake embedding per message, as a chat with semantic recall leaves it.
async function seedThread(resource: string, words: string[]) {
  const threadId = `thr_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  seeded.push(threadId)
  const store = (await storage.getStore('memory'))!
  const now = new Date()
  await store.saveThread({ thread: { id: threadId, resourceId: resource, title: '', createdAt: now, updatedAt: now, metadata: {} } })
  const messages = words.map((text, i) => ({
    id: randomUUID(), threadId, resourceId: resource, role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
    content: { format: 2 as const, parts: [{ type: 'text' as const, text }] }, createdAt: new Date(now.getTime() + i),
  }))
  await store.saveMessages({ messages })
  await vector.upsert({
    indexName: INDEX,
    vectors: messages.map((_, i) => Array.from({ length: 1024 }, (_, d) => (d === i ? 1 : 0.001))),
    metadata: messages.map((m) => ({ message_id: m.id, thread_id: threadId, resource_id: resource, role: m.role, content: words[messages.indexOf(m)], created_at: m.createdAt.toISOString() })),
  })
  return threadId
}

describe('DELETE /v1/minds/{mindId}/threads/{threadId}', () => {
  const userId = `test-user-${randomUUID()}`
  const mindId = `mnd_${randomUUID().slice(0, 8)}`

  test('needs X-Engine-Key, a valid mind id and the user id', async () => {
    assert.equal((await forget(mindId, 'thr_x', { userId }, {})).status, 401)
    assert.equal((await forget('bad..id', 'thr_x', { userId })).status, 400)
    const noUser = await forget(mindId, 'thr_x', {})
    assert.equal(noUser.status, 400)
    assert.equal((await noUser.json()).error, 'invalid_body')
  })

  test('drops the thread, its messages and their embeddings; the other thread of the Mind stays', async () => {
    const resource = resourceId(userId, mindId)
    const gone = await seedThread(resource, ['my locker code is 4817', 'Noted.'])
    const kept = await seedThread(resource, ['what is the weather', 'Sunny.'])
    assert.deepEqual(await left(gone), { thread: 1, messages: 2, vectors: 2 }, 'seeded')

    const res = await forget(mindId, gone, { userId })
    assert.equal(res.status, 204, await res.text())
    assert.deepEqual(await left(gone), { thread: 0, messages: 0, vectors: 0 })
    assert.deepEqual(await left(kept), { thread: 1, messages: 2, vectors: 2 }, 'the other chat is untouched')
    assert.equal(await (await memory()).getThreadById({ threadId: gone }), null)
  })

  test('asking again, or for a thread Mastra never had, is 204', async () => {
    const resource = resourceId(userId, mindId)
    const threadId = await seedThread(resource, ['hello'])
    assert.equal((await forget(mindId, threadId, { userId })).status, 204)
    assert.equal((await forget(mindId, threadId, { userId })).status, 204, 'twice')
    assert.equal((await forget(mindId, 'thr_never_seen', { userId })).status, 204)
  })

  test('works under a persona version (#116), and never touches another user\'s or Mind\'s thread', async () => {
    const versioned = await seedThread(resourceId(userId, mindId, 2), ['renamed Mind chat'])
    assert.equal((await forget(mindId, versioned, { userId })).status, 204)
    assert.equal((await left(versioned)).messages, 0)

    const theirs = await seedThread(resourceId(`other-${userId}`, mindId), ['not yours'])
    const otherMind = await seedThread(resourceId(userId, `${mindId}x`), ['other Mind'])
    for (const t of [theirs, otherMind]) {
      const res = await forget(mindId, t, { userId })
      assert.deepEqual([res.status, await res.json()], [404, { error: 'thread_not_found' }])
      assert.deepEqual(await left(t), { thread: 1, messages: 1, vectors: 1 }, 'left alone')
    }
  })

  test('after the delete, semantic recall in another chat no longer finds it (NEAR AI embeddings)', async () => {
    const resource = resourceId(userId, `${mindId}live`)
    const mem = await memory()
    const now = new Date()
    const [gone, kept] = [`thr_live_a_${randomUUID().slice(0, 8)}`, `thr_live_b_${randomUUID().slice(0, 8)}`]
    seeded.push(gone, kept)
    for (const id of [gone, kept]) await mem.saveThread({ thread: { id, resourceId: resource, title: '', createdAt: now, updatedAt: now, metadata: {} } })
    const msg = (threadId: string, text: string, i: number) => ({
      id: randomUUID(), threadId, resourceId: resource, role: 'user' as const, content: { format: 2 as const, parts: [{ type: 'text' as const, text }] }, createdAt: new Date(now.getTime() + i),
    })
    // Memory embeds these through the configured embedder, exactly as after a chat turn.
    await mem.saveMessages({ messages: [msg(gone, 'My bike lock combination is 4817.', 0), msg(kept, 'I like green tea in the morning.', 1)] })
    const recalled = async () => (await mem.recall({ threadId: kept, resourceId: resource, vectorSearchString: 'What is my bike lock combination?' })).messages
      .flatMap((m) => m.content.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])))
    assert.ok((await recalled()).some((t) => t.includes('4817')), 'before: recalled from the other chat')

    assert.equal((await forget(`${mindId}live`, gone, { userId })).status, 204)
    assert.ok(!(await recalled()).some((t) => t.includes('4817')), 'after: gone from recall')
    assert.equal((await left(kept)).messages, 1)
  })
})
