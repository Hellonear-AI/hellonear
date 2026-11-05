// Unit tests for Mind Graph node ids (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nodeIdFor } from '../src/graph.ts'

test('regular tools map to tool nodes', () => {
  assert.equal(nodeIdFor('m1', 'add_numbers', { a: 1, b: 2 }), 'tool:add_numbers')
})

test('wallet tools map to the Mind\'s wallet node', () => {
  for (const tool of ['send_payment', 'get_balance', 'list_payments']) assert.equal(nodeIdFor('m1', tool, {}), 'wallet:m1')
})

test('skill activations and reads map to skill nodes', () => {
  assert.equal(nodeIdFor('m1', 'skill', { name: 'payments' }), 'skill:payments')
  assert.equal(nodeIdFor('m1', 'skill_read', { skillName: 'payments', path: 'x.md' }), 'skill:payments')
})

test('skill tools without a name fall back to a tool node', () => {
  assert.equal(nodeIdFor('m1', 'skill', {}), 'tool:skill')
  assert.equal(nodeIdFor('m1', 'skill_search', { query: 'pay' }), 'tool:skill_search')
})
