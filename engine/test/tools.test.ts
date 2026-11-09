// Unit tests for tool selection (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsApproval, toolsFor } from '../src/tools.ts'

test('approval tools are flagged', () => {
  assert.equal(needsApproval('send_payment'), true)
  assert.equal(needsApproval('http_request'), false)
  assert.equal(needsApproval('nope'), false)
})

test('attended runs get approval tools, unattended runs never do', () => {
  assert.deepEqual(Object.keys(toolsFor(['send_payment', 'get_balance', 'get_time'])), ['get_time', 'send_payment', 'get_balance'])
  assert.deepEqual(Object.keys(toolsFor(['send_payment', 'get_balance', 'near_view_account'], { unattended: true })), ['get_time', 'get_balance', 'near_view_account'])
})

test('get_time gives the weekday and the owner\'s local time, computed, not guessed (#112)', async () => {
  const { localTime } = await import('../src/tools.ts')
  // Monday 9 Nov 2026, 11:30 UTC.
  const now = new Date('2026-11-09T11:30:00Z')
  assert.deepEqual(localTime(now), { date: '2026-11-09', time: '11:30', weekday: 'Monday', utcOffset: '+00:00' })
  assert.deepEqual(localTime(now, 'Asia/Jakarta'), { date: '2026-11-09', time: '18:30', weekday: 'Monday', utcOffset: '+07:00' })
  // After 17:00 WIB the UTC date is still the day before; the local one is not.
  const evening = new Date('2026-11-09T18:30:00Z')
  assert.equal(localTime(evening, 'Asia/Jakarta').date, '2026-11-10')
  assert.equal(localTime(evening, 'Asia/Jakarta').weekday, 'Tuesday')
  assert.equal(localTime(now, 'America/New_York').utcOffset, '-05:00')
})
