import { test } from 'node:test'
import assert from 'node:assert/strict'
import { probeEmbedder } from '../src/embedderHealth.ts'

// A hung embedder (NEAR AI, 13 Nov) must read as down within the timeout, not hang the probe.
test('the probe reads a hung, failing or empty embedder as down, and a vector as up', async () => {
  const hung = { doEmbed: ({ abortSignal }: { abortSignal?: AbortSignal }) => new Promise<never>((_, reject) => abortSignal?.addEventListener('abort', () => reject(abortSignal.reason))) } as any
  const started = Date.now()
  assert.equal(await probeEmbedder(hung, 200), false)
  assert.ok(Date.now() - started < 2000, 'gave up at the timeout')
  assert.equal(await probeEmbedder({ doEmbed: async () => { throw new Error('503') } } as any, 200), false)
  assert.equal(await probeEmbedder({ doEmbed: async () => ({ embeddings: [[]] }) } as any, 200), false)
  assert.equal(await probeEmbedder({ doEmbed: async () => ({ embeddings: [[0.1, 0.2]] }) } as any, 200), true)
})
