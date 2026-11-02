// Unit tests for tool selection (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsApproval, toolsFor } from '../src/tools.ts'

test('approval tools are flagged', () => {
  assert.equal(needsApproval('demo_transfer'), true)
  assert.equal(needsApproval('http_request'), false)
  assert.equal(needsApproval('nope'), false)
})

test('attended runs get approval tools, unattended runs never do', () => {
  assert.deepEqual(Object.keys(toolsFor(['demo_transfer', 'get_time'])), ['get_time', 'demo_transfer'])
  assert.deepEqual(Object.keys(toolsFor(['demo_transfer', 'near_view_account'], { unattended: true })), ['get_time', 'near_view_account'])
})
