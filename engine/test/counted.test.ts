// `count` beside every list a read tool returns (#264), so a Builder If can compare "Number of events > 0".
// Run: node --import tsx --test test/counted.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { withCount } from '../src/counted.ts'
import { toolRegistry } from '../src/tools.ts'

const cfg = (out: unknown) => withCount('items', {
  inputSchema: z.object({}),
  outputSchema: z.object({ items: z.array(z.string()) }),
  execute: async () => out,
})

test('count is in the output schema and filled from the list', async () => {
  const c = cfg({ items: ['a', 'b', 'c'] })
  assert.ok('count' in c.outputSchema.shape)
  assert.deepEqual(await c.execute({}, {}), { items: ['a', 'b', 'c'], count: 3 })
  assert.deepEqual(await cfg({ items: [] }).execute({}, {}), { items: [], count: 0 })
})

test('a validation error or a missing list is left alone or counted as 0', async () => {
  assert.deepEqual(await cfg({ error: true, message: 'bad' }).execute({}, {}), { error: true, message: 'bad' })
  assert.deepEqual(await cfg({ note: 'nothing' }).execute({}, {}), { note: 'nothing', count: 0 })
})

// Every registry tool that returns a top-level array also returns `count`, so the Builder can offer it for each.
const props = (schema: any): Record<string, any> => schema?.['~standard']?.jsonSchema?.output({ target: 'draft-07' })?.properties ?? {}
// Not lists of results: one item's fields (mail_read), what a write sent or skipped, or money shares.
const NOT_RESULT_LISTS = new Set(['split_amount', 'gmail_organize', 'googlecalendar_create_meeting', 'mail_send', 'mail_read', 'mail_send_to_owner', 'notion_update_row'])
test('every list-returning tool declares count', () => {
  const missing = Object.entries(toolRegistry as Record<string, any>).filter(([name]) => !NOT_RESULT_LISTS.has(name)).flatMap(([name, t]) => {
    const p = props(t.outputSchema)
    const lists = Object.keys(p).filter((k) => p[k]?.type === 'array')
    return lists.length && !('count' in p) ? [`${name} (${lists.join(', ')})`] : []
  })
  assert.deepEqual(missing, [])
})
