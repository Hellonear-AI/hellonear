// Autopilot limits (src/autopilotLimits.ts): how often a schedule may fire, how many may be on, and the daily cap
// on scheduled runs. Offline: the last test drives Mastra's real scheduler on its in-memory store.
// Run: bun run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Mastra } from '@mastra/core'
import { InMemoryStore } from '@mastra/core/storage'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { capFires, capIssue, cronIssue, dailyCounter, fireMinutes, limits } from '../src/autopilotLimits.ts'

test('the minute field expands to the minutes it fires on', () => {
  assert.equal(fireMinutes('*')!.length, 60)
  assert.deepEqual(fireMinutes('*/15'), [0, 15, 30, 45])
  assert.deepEqual(fireMinutes('30,0'), [0, 30])
  assert.deepEqual(fireMinutes('10-12'), [10, 11, 12])
  assert.deepEqual(fireMinutes('0-59/20'), [0, 20, 40])
  assert.deepEqual(fireMinutes('5/25'), [5, 30, 55])
  assert.deepEqual(fireMinutes('7,7,*/30'), [0, 7, 30])
  for (const bad of ['', '60', '5-2', '*/0', 'a', '1,', '?', '-5', '1-2-3', '*/5/5', '0x10', '100']) assert.equal(fireMinutes(bad), null, bad)
})

test('a schedule may fire at most 4 times an hour, at least 15 minutes apart', () => {
  const table: [string, string | null][] = [
    ['* * * * *', 'too_frequent'],
    ['*/5 * * * *', 'too_frequent'],
    ['*/14 * * * *', 'too_frequent'],
    ['*/15 * * * *', null],
    ['0,30 * * * *', null],
    ['0,15,30,45 * * * *', null],
    ['0 * * * *', null],
    ['0 8 * * *', null],
    ['30 7 * * 1-5', null],
    // Refused although it fires only on weekday mornings: only the minute field is read.
    ['0,10 9 * * 1-5', 'too_frequent'],
    ['0-59/20 * * * *', null],
    ['0-59/10 * * * *', 'too_frequent'],
    ['10-12 * * * *', 'too_frequent'],
    // 0, 25, 50: the gap across the top of the hour is 10 minutes.
    ['*/25 * * * *', 'too_frequent'],
    ['50,5 * * * *', null],
    ['55,5 * * * *', 'too_frequent'],
    ['*/30 9-17 * * *', null],
    ['  0   8 * * *  ', null],
    ['', 'invalid_schedule'],
    ['* * * *', 'invalid_schedule'],
    // Six fields would be seconds for Mastra's cron library.
    ['* * * * * *', 'invalid_schedule'],
    ['@hourly', 'invalid_schedule'],
    ['61 * * * *', 'invalid_schedule'],
    ['MON * * * *', 'invalid_schedule'],
    ['? * * * *', 'invalid_schedule'],
  ]
  for (const [cron, code] of table) assert.equal(cronIssue(cron)?.code ?? null, code, JSON.stringify(cron))
  assert.match(cronIssue('* * * * *')!.message, /at most 4 times an hour, at least 15 minutes apart/)
  assert.equal(cronIssue('* * * * *', 1), null, 'a local engine may allow every minute for its tests')
  assert.equal(cronIssue('*/30 * * * *', 60)?.code, 'too_frequent')
})

test('the limits have defaults and read their env override per call', () => {
  assert.deepEqual([limits.minGapMinutes, limits.perMind, limits.perUser, limits.firesPerDay], [15, 5, 10, 100])
  try {
    process.env.AUTOPILOT_MIN_GAP_MINUTES = '1'
    assert.equal(limits.minGapMinutes, 1)
    assert.equal(cronIssue('* * * * *'), null)
    for (const bad of ['0', '-3', 'abc', '1.5', '']) {
      process.env.AUTOPILOT_MIN_GAP_MINUTES = bad
      assert.equal(limits.minGapMinutes, 15, bad)
    }
  } finally {
    delete process.env.AUTOPILOT_MIN_GAP_MINUTES
  }
})

test('at most 5 schedules on per Mind and 10 per owner', () => {
  const on = (n: number, mindId: string, userId: string) => Array.from({ length: n }, (_, i) => ({ id: `${mindId}-${i}`, mindId, userId }))
  assert.equal(capIssue([], 'm1', 'u1'), null)
  assert.equal(capIssue(on(4, 'm1', 'u1'), 'm1', 'u1'), null)
  const sixth = capIssue(on(5, 'm1', 'u1'), 'm1', 'u1')
  assert.equal(sixth?.code, 'too_many_schedules')
  assert.match(sixth!.message, /at most 5/)
  assert.equal(capIssue(on(5, 'm1', 'u1'), 'm2', 'u1'), null, 'another Mind of the same owner')
  assert.equal(capIssue(on(5, 'm1', 'u1'), 'm2', 'u2'), null, 'another owner')
  const eleventh = capIssue([...on(5, 'm1', 'u1'), ...on(5, 'm2', 'u1')], 'm3', 'u1')
  assert.equal(eleventh?.code, 'too_many_schedules')
  assert.match(eleventh!.message, /at most 10/)
  // Schedules with no owner recorded count for nobody.
  assert.equal(capIssue(Array.from({ length: 20 }, (_, i) => ({ id: `x${i}` })), 'm1', 'u1'), null)
  assert.equal(capIssue(on(1, 'm1', 'u1'), 'm1', 'u1', { perMind: 1, perUser: 9 })?.code, 'too_many_schedules')
})

test('the daily counter counts per key and starts again on the next UTC day', () => {
  let now = Date.parse('2026-11-14T23:59:00Z')
  const c = dailyCounter(() => 2, () => now)
  assert.deepEqual([c.take('user:a'), c.take('user:a'), c.take('user:a')], [true, true, false])
  assert.equal(c.take('user:b'), true, 'another owner has their own count')
  now += 60_000
  assert.deepEqual([c.take('user:a'), c.take('user:a'), c.take('user:a')], [true, true, false], 'a new UTC day')
})

test('over the cap the claim still moves the schedule on, but no run starts', async () => {
  const claims: unknown[][] = []
  const lines: string[] = []
  let won = true
  const store = { async updateScheduleNextFire(...args: unknown[]) { claims.push(args); return won } }
  const keys: Record<string, string | null> = { s1: 'user:a', s2: 'user:a', s3: 'user:b', other: null }
  capFires(store as never, async (id) => { if (id === 'broken') throw new Error('no row'); return keys[id] }, dailyCounter(() => 2), (l) => lines.push(l))
  const fire = (id: string) => store.updateScheduleNextFire(id, 1, 2, 3, `sched_${id}_1`)
  assert.deepEqual([await fire('s1'), await fire('s2'), await fire('s1')], [true, true, false], 'two schedules of one owner share the count')
  assert.equal(claims.length, 3, 'the skipped fire was still claimed')
  assert.deepEqual(claims[2], ['s1', 1, 2, 3, 'sched_s1_1'])
  assert.deepEqual(lines, ['autopilot: daily limit of scheduled runs reached, skipped a fire of s1'])
  assert.equal(await fire('s3'), true, 'another owner')
  for (let i = 0; i < 5; i++) assert.equal(await fire('other'), true, 'not an Autopilot schedule: never limited')
  assert.deepEqual([await fire('broken'), await fire('broken'), await fire('broken')], [true, true, false], 'an unknown owner is capped per schedule')
  // A claim another process won is not counted.
  won = false
  const fresh = { async updateScheduleNextFire(..._args: unknown[]) { return won } }
  const counter = dailyCounter(() => 1)
  capFires(fresh as never, async () => 'user:c', counter)
  assert.equal(await fresh.updateScheduleNextFire('s9'), false)
  assert.equal(counter.take('user:c'), true)
})

// The cap relies on how @mastra/core 1.81.0 fires a schedule: claim first, start the run only if the claim says yes.
// If an upgrade changes that, this fails.
test("Mastra's scheduler starts no run for a fire the cap refused", async () => {
  let ran = 0
  const step = createStep({ id: 'count', inputSchema: z.object({}), outputSchema: z.object({}), execute: async () => { ran++; return {} } })
  const workflow = createWorkflow({ id: 'capped', inputSchema: z.object({}), outputSchema: z.object({}) }).then(step).commit()
  const storage = new InMemoryStore()
  const mastra = new Mastra({ storage, workflows: { capped: workflow }, scheduler: { enabled: true, tickIntervalMs: 200 }, logger: false })
  const store = (await storage.getStore('schedules'))!
  const lines: string[] = []
  capFires(store as never, async () => 'user:a', dailyCounter(() => 2), (l) => lines.push(l))
  await mastra.startWorkers()
  try {
    // Six fields: every second, so the test does not wait for a minute.
    const schedule = await mastra.schedules.create({ workflowId: 'capped', cron: '* * * * * *', inputData: {} })
    for (const deadline = Date.now() + 15_000; lines.length < 2 && Date.now() < deadline; await new Promise((r) => setTimeout(r, 200)));
    await mastra.schedules.delete(schedule.id)
    await new Promise((r) => setTimeout(r, 500))
    assert.ok(lines.length >= 2, `fires past the cap were skipped (${lines.length})`)
    assert.equal(ran, 2, 'only the fires under the cap ran')
  } finally {
    await mastra.stopWorkers()
  }
})
