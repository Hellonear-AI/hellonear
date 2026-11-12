// The status page's numbers, without Postgres or the network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUCKETS, BUCKET_MS, buckets, incidents, overall, report, uptime, verdict, type Check } from '../src/statusMath.ts'

const now = new Date('2026-11-13T10:47:00Z')
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000)
const c = (service: string, minutesAgo: number, status: Check['status'], extra: Partial<Check> = {}): Check => ({ service, checkedAt: at(minutesAgo), status, latencyMs: 100, detail: null, ...extra })

test('uptime counts degraded as up, rounds to 2 decimals, and is null without checks', () => {
  assert.equal(uptime([]), null)
  assert.equal(uptime([c('a', 1, 'operational'), c('a', 2, 'degraded'), c('a', 3, 'down')]), 66.67)
  assert.equal(uptime([c('a', 1, 'down')]), 0)
  assert.equal(uptime([c('a', 1, 'operational')]), 100)
})

test('48 half-hour buckets, oldest first, ending with the one holding now; each the worst check inside', () => {
  const b = buckets([c('a', 2, 'operational'), c('a', 5, 'down'), c('a', 20, 'degraded'), c('a', 50, 'operational'), c('a', 25 * 60, 'down')], now)
  assert.equal(b.length, BUCKETS)
  assert.equal(b.at(-1)!.start, '2026-11-13T10:30:00.000Z', 'the last bucket holds now')
  assert.equal(new Date(b[1].start).getTime() - new Date(b[0].start).getTime(), BUCKET_MS)
  assert.equal(b.at(-1)!.status, 'down', '10:42 down beats 10:45 operational')
  assert.equal(b.at(-2)!.status, 'degraded', '10:27 degraded')
  assert.equal(b.at(-3)!.status, 'operational', '09:57')
  assert.equal(b[0].status, 'none', 'a check older than 24 h is outside')
  assert.equal(b.filter((x) => x.status === 'none').length, BUCKETS - 3)
})

test('each bucket counts its checks and bad ones, with the last bad check\'s detail for the hover text', () => {
  const b = buckets([
    c('a', 8, 'operational'), c('a', 6, 'down', { detail: 'No answer in 30 s.' }), c('a', 4, 'degraded', { detail: 'Slow: 4.0 s.' }), c('a', 2, 'operational'),
    c('a', 35, 'operational'), c('a', 40, 'operational'),
  ], now)
  assert.deepEqual(b.at(-1), { start: '2026-11-13T10:30:00.000Z', status: 'down', checks: 4, bad: 2, detail: 'Slow: 4.0 s.' })
  assert.deepEqual(b.at(-2), { start: '2026-11-13T10:00:00.000Z', status: 'operational', checks: 2, bad: 0, detail: null })
  assert.deepEqual(b[0], { start: b[0].start, status: 'none', checks: 0, bad: 0, detail: null })
})

test('incidents: one ongoing, one resolved, and two runs split by a single good check; newest first', () => {
  const meta = [{ id: 'q', name: 'Quotes', group: 'NEAR' as const, impact: 'x' }, { id: 'e', name: 'Embeddings', group: 'NEAR AI' as const, impact: 'y' }]
  const list = incidents(meta, [
    // q: degraded 10:02-10:07, then a good check, then down 10:17 to now (ongoing)
    c('q', 45, 'degraded', { detail: 'Slow.' }), c('q', 40, 'degraded', { detail: 'Slower.' }), c('q', 35, 'operational'),
    c('q', 30, 'down', { detail: 'HTTP 500.' }), c('q', 25, 'degraded', { detail: 'Slow again.' }),
    // e: down 08:47-09:17 (resolved at 09:17), the last bad detail kept
    c('e', 120, 'operational'), c('e', 115, 'down', { detail: 'No answer.' }), c('e', 100, 'down', { detail: 'Still nothing.' }), c('e', 90, 'operational'), c('e', 5, 'operational'),
  ], now)
  assert.deepEqual(list, [
    { service: 'q', name: 'Quotes', status: 'down', start: at(30).toISOString(), end: null, minutes: 30, detail: 'Slow again.' },
    { service: 'q', name: 'Quotes', status: 'degraded', start: at(45).toISOString(), end: at(35).toISOString(), minutes: 10, detail: 'Slower.' },
    { service: 'e', name: 'Embeddings', status: 'down', start: at(115).toISOString(), end: at(90).toISOString(), minutes: 25, detail: 'Still nothing.' },
  ])
})

test('incidents are capped at 100, keeping the newest', () => {
  const meta = [{ id: 'f', name: 'Flappy', group: 'Partners' as const, impact: 'z' }]
  const checks: Check[] = []
  for (let i = 0; i < 150; i++) checks.push(c('f', 2 * i + 2, 'operational'), c('f', 2 * i + 1, 'down'))
  const list = incidents(meta, checks, now)
  assert.equal(list.length, 100)
  assert.equal(list[0].start, at(1).toISOString())
})

test('overall: HelloNear down is down; any other trouble is degraded; unknown changes nothing', () => {
  assert.equal(overall([{ id: 'hellonear-api', group: 'HelloNear', status: 'down' }]), 'down')
  assert.equal(overall([{ id: 'hellonear-api', group: 'HelloNear', status: 'operational' }, { id: 'near-intents-quote', group: 'NEAR', status: 'down' }]), 'degraded')
  assert.equal(overall([{ id: 'x', group: 'Partners', status: 'degraded' }]), 'degraded')
  assert.equal(overall([{ id: 'x', group: 'Partners', status: 'unknown' }, { id: 'y', group: 'NEAR', status: 'operational' }]), 'operational')
})

test('verdict: error is down, slower than the threshold is degraded', () => {
  assert.equal(verdict(false, 10, 1000), 'down')
  assert.equal(verdict(true, 1500, 1000), 'degraded')
  assert.equal(verdict(true, 1000, 1000), 'operational')
})

test('report: services in the given order, latest check is current, a stale one is unknown, uptimes per window', () => {
  const meta = [
    { id: 'b', name: 'B', group: 'NEAR' as const, impact: 'B breaks.' },
    { id: 'a', name: 'A', group: 'HelloNear' as const, impact: 'A breaks.' },
    { id: 'z', name: 'Z', group: 'Partners' as const, impact: 'Z breaks.' },
  ]
  const r = report(meta, [
    c('a', 1, 'operational', { latencyMs: 42 }), c('a', 6, 'down'),
    c('b', 30, 'degraded', { detail: 'Slow.' }), c('b', 3 * 24 * 60, 'down'),
    c('ignored', 1, 'down'),
  ], now)
  assert.deepEqual(r.services.map((s) => s.id), ['b', 'a', 'z'])
  const [b, a, z] = r.services
  assert.deepEqual([a.status, a.latencyMs, a.checkedAt, a.uptime24h], ['operational', 42, at(1).toISOString(), 50])
  assert.equal(b.status, 'unknown', 'last check 30 min ago is stale')
  assert.equal(b.detail, 'No check in the last 15 minutes.')
  assert.deepEqual([b.uptime24h, b.uptime7d], [100, 50])
  assert.deepEqual([z.status, z.checkedAt, z.uptime7d, z.history.every((h) => h.status === 'none')], ['unknown', null, null, true])
  assert.equal(r.overall, 'operational', 'a is up now; b and z are unknown')
  assert.equal(r.updatedAt, now.toISOString())
  assert.deepEqual(r.incidents.map((i) => [i.service, i.status, i.end === null]), [['a', 'down', false], ['b', 'down', true]], 'a was resolved by its next check; b went from down to degraded with no good check, so it is still ongoing')
})
