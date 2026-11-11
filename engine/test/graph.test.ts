// Unit tests for Mind Graph node ids (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nodeIdFor } from '../src/graph.ts'

test('regular tools map to tool nodes', () => {
  assert.equal(nodeIdFor('m1', 'add_numbers', { a: 1, b: 2 }), 'tool:add_numbers')
})

test('wallet tools map to the Mind\'s wallet node', () => {
  for (const tool of ['send_payment', 'get_balance', 'list_payments', 'buy_data', 'get_quotes', 'sell_offer', 'buy_from_mind']) assert.equal(nodeIdFor('m1', tool, {}), 'wallet:m1')
})

test('Gmail tools map to the gmail App node', () => {
  for (const tool of ['gmail_list_emails', 'gmail_read_email', 'gmail_create_draft']) assert.equal(nodeIdFor('m1', tool, {}), 'app:gmail')
})

test('skill activations and reads map to skill nodes', () => {
  assert.equal(nodeIdFor('m1', 'skill', { name: 'payments' }), 'skill:payments')
  assert.equal(nodeIdFor('m1', 'skill_read', { skillName: 'payments', path: 'x.md' }), 'skill:payments')
})

test('skill tools without a name fall back to a tool node', () => {
  assert.equal(nodeIdFor('m1', 'skill', {}), 'tool:skill')
  assert.equal(nodeIdFor('m1', 'skill_search', { query: 'pay' }), 'tool:skill_search')
})

test('a skill named by its internal path lights the same skill node (11 Nov)', () => {
  assert.equal(nodeIdFor('m1', 'skill', { name: 'inline/best-price/SKILL.md' }), 'skill:best-price')
  assert.equal(nodeIdFor('m1', 'skill', { name: 'best-price' }), 'skill:best-price')
  assert.equal(nodeIdFor('m1', 'skill_read', { skillName: 'inline/payments/SKILL.md' }), 'skill:payments')
})
