// A Mind's working memory in Settings (#209): GET/PUT/DELETE /v1/minds/{mindId}/memory read, replace and clear the
// document of one resource (`userId:mindId[:vN]`), and the per-run switches reach Mastra. Local Postgres from
// docker-compose. The switch tests run the real Memory with a mock model (@mastra/core/test-utils/llm-mock) and look
// at what the model was given; only the last test embeds through NEAR AI.
// Run all: node --env-file=.env --import tsx --test test/memory.test.ts
// Without NEAR AI: add --test-skip-pattern="NEAR AI"
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { Agent } from '@mastra/core/agent'
import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { server } from '../src/server.ts'
import { mindAgent, vector } from '../src/mastra.ts'
import { memoryOptions, mindSchema, resourceId } from '../src/mind.ts'
import { readWorkingMemory, writeWorkingMemory } from '../src/memory.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!

before(async () => {
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

const ids = () => ({ userId: `usr_${randomUUID().slice(0, 8)}`, mindId: `mnd_${randomUUID().replace(/-/g, '').slice(0, 24)}` })
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = { 'x-engine-key': key }) =>
  fetch(base + path, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })

describe('memory routes (#209)', () => {
  test('a Mind with no memory yet reads as an empty document with no time', async () => {
    const { userId, mindId } = ids()
    const res = await call('GET', `/v1/minds/${mindId}/memory?userId=${userId}`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { memory: { markdown: '', updatedAt: null } })
  })

  test('PUT replaces the document, GET reads it back with its time, DELETE clears it', async () => {
    const { userId, mindId } = ids()
    const doc = '# You\n- Name: Sam\n\n# Preferences\n- Short replies'
    const put = await call('PUT', `/v1/minds/${mindId}/memory`, { userId, markdown: doc })
    assert.equal(put.status, 200)
    const written = (await put.json()).memory
    assert.equal(written.markdown, doc)
    assert.ok(Math.abs(Date.parse(written.updatedAt) - Date.now()) < 60_000, 'updatedAt is the write time')
    assert.deepEqual((await (await call('GET', `/v1/minds/${mindId}/memory?userId=${userId}`)).json()).memory, written)

    const second = '# You\n- Name: Sam'
    assert.equal((await (await call('PUT', `/v1/minds/${mindId}/memory`, { userId, markdown: second })).json()).memory.markdown, second, 'replaced, not merged')

    const del = await call('DELETE', `/v1/minds/${mindId}/memory`, { userId })
    assert.equal(del.status, 204)
    assert.deepEqual((await (await call('GET', `/v1/minds/${mindId}/memory?userId=${userId}`)).json()).memory, { markdown: '', updatedAt: null })
    // Mastra reads a cleared document as none, so the next run starts from its template again.
    assert.equal(await (await mindAgent.getMemory())!.getWorkingMemory({ threadId: '', resourceId: resourceId(userId, mindId) }), null)
  })

  test('the key is the one chat uses: per user, per Mind, per persona version', async () => {
    const { userId, mindId } = ids()
    await call('PUT', `/v1/minds/${mindId}/memory`, { userId, personaVersion: 2, markdown: 'v2 notes' })
    assert.equal((await readWorkingMemory(resourceId(userId, mindId, 2))).markdown, 'v2 notes')
    assert.equal((await (await call('GET', `/v1/minds/${mindId}/memory?userId=${userId}&personaVersion=2`)).json()).memory.markdown, 'v2 notes')
    assert.equal((await (await call('GET', `/v1/minds/${mindId}/memory?userId=${userId}`)).json()).memory.markdown, '', 'the original persona has its own')
    assert.equal((await (await call('GET', `/v1/minds/${mindId}/memory?userId=usr_other&personaVersion=2`)).json()).memory.markdown, '', 'another user')
    await call('DELETE', `/v1/minds/${mindId}/memory`, { userId })
    assert.equal((await readWorkingMemory(resourceId(userId, mindId, 2))).markdown, 'v2 notes', 'clearing one version leaves the other')
  })

  test('bad ids, bodies and methods are refused; the engine key is required', async () => {
    const { userId, mindId } = ids()
    assert.equal((await call('GET', `/v1/minds/${mindId}/memory?userId=${userId}`, undefined, {})).status, 401)
    assert.equal((await call('GET', `/v1/minds/${mindId}/memory`)).status, 400, 'no userId')
    assert.equal((await call('GET', `/v1/minds/${mindId}/memory?userId=${userId}&personaVersion=-1`)).status, 400)
    assert.equal((await call('GET', `/v1/minds/not%20a%20mind/memory?userId=${userId}`)).status, 400)
    assert.equal((await call('PUT', `/v1/minds/${mindId}/memory`, { userId })).status, 400, 'no markdown')
    assert.equal((await call('PUT', `/v1/minds/${mindId}/memory`, { userId, markdown: 'x'.repeat(20_001) })).status, 400, 'too long')
    assert.equal((await call('DELETE', `/v1/minds/${mindId}/memory`, {})).status, 400)
    assert.equal((await call('POST', `/v1/minds/${mindId}/memory`, { userId })).status, 405)
  })
})

describe('memory switches per run (#209)', () => {
  // The Mind agent's own Memory (storage, vector, embedder, options from src/mastra.ts) on a mock model, so the test
  // sees exactly the prompt and tools Mastra hands the model for these per-call options.
  async function run(memory: { enabled?: boolean; recall?: boolean } | undefined, resource: string) {
    const calls: any[] = []
    const agent = new Agent({ id: 'memory-test', name: 'Memory test', instructions: 'You help.', model: createMockModel({ mockText: 'ok', spyGenerate: (p) => calls.push(p) }) as never, memory: (await mindAgent.getMemory())! })
    const mind = mindSchema.parse({ templateId: 't', name: 'Rex', soul: { identity: 'x' }, ...(memory ? { memory } : {}) })
    await agent.generate('What do you know about me?', { memory: { resource, thread: `thr_${randomUUID().replace(/-/g, '').slice(0, 24)}`, options: memoryOptions(mind) } })
    const prompt = JSON.stringify(calls[0].prompt)
    const tools = (calls[0].tools ?? []).map((t: { name: string }) => t.name)
    return { prompt, tools }
  }
  // Counts vector searches (semantic recall) during a run.
  async function searches<T>(fn: () => Promise<T>): Promise<{ out: T; n: number }> {
    const original = vector.query.bind(vector)
    let n = 0
    vector.query = (async (...args: Parameters<typeof vector.query>) => { n++; return original(...args) }) as typeof vector.query
    try { return { out: await fn(), n } } finally { vector.query = original }
  }

  test('"Remember things about you" on: the document is in the prompt and the Mind can update it', async () => {
    const { userId, mindId } = ids()
    const resource = resourceId(userId, mindId)
    await writeWorkingMemory(resource, '# You\n- Favourite colour: teal-7731')
    const { prompt, tools } = await run({ recall: false }, resource)
    assert.ok(prompt.includes('teal-7731'))
    assert.ok(tools.includes('updateWorkingMemory'), tools.join())
  })

  test('off: the Mind neither reads nor can write working memory', async () => {
    const { userId, mindId } = ids()
    const resource = resourceId(userId, mindId)
    await writeWorkingMemory(resource, '# You\n- Favourite colour: teal-7731')
    const { out: { prompt, tools }, n } = await searches(() => run({ enabled: false, recall: false }, resource))
    assert.ok(!prompt.includes('teal-7731'), 'not in the prompt')
    assert.ok(!tools.includes('updateWorkingMemory'), tools.join())
    assert.equal(n, 0, '"Search past chats" off: no vector search')
    assert.equal((await readWorkingMemory(resource)).markdown, '# You\n- Favourite colour: teal-7731', 'kept, only not used')
  })

  test('"Search past chats" on searches the vectors; off does not (NEAR AI embeddings)', async () => {
    const { userId, mindId } = ids()
    const resource = resourceId(userId, mindId)
    assert.ok((await searches(() => run(undefined, resource))).n > 0, 'default: recall on')
    assert.equal((await searches(() => run({ recall: false }, resource))).n, 0)
  })
})
