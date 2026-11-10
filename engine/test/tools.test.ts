// Unit tests for tool selection (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsApproval, splitAmount, toolsFor } from '../src/tools.ts'

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

test('reply text never carries an em or en dash (#124)', async () => {
  const { plainDashes } = await import('../src/mind.ts')
  assert.equal(plainDashes('Sabtu 08:00 — berangkat; 09:00–10:00'), 'Sabtu 08:00 - berangkat; 09:00-10:00')
  assert.equal(plainDashes('no dashes here'), 'no dashes here')
})

test('split_amount works shares out in yoctoNEAR, rounded down to 4 decimals (#177, #190)', () => {
  // The case a model got 10 times too small (11 Nov): 40% and 60% of 0.05.
  assert.deepEqual(splitAmount('0.05', [{ to: 'alice.testnet', weight: 40 }, { to: 'bob.testnet', weight: 60 }]), {
    amountNear: '0.05', shares: [{ to: 'alice.testnet', amountNear: '0.02' }, { to: 'bob.testnet', amountNear: '0.03' }], totalOfShares: '0.05', leftOver: '0',
  })
  const thirds = splitAmount('1', [{ to: 'a', weight: 1 }, { to: 'b', weight: 1 }, { to: 'c', weight: 1 }])
  assert.deepEqual(thirds.shares.map((s) => s.amountNear), ['0.3333', '0.3333', '0.3333'])
  assert.equal(thirds.leftOver, '0.0001')
  // Below a step: nothing to pay, and the left-over keeps every digit.
  assert.deepEqual(splitAmount('0.00005', [{ to: 'a', weight: 1 }, { to: 'b', weight: 1 }]).leftOver, '0.00005')
  assert.throws(() => splitAmount('1', [{ to: 'a', weight: 0 }]))
})
