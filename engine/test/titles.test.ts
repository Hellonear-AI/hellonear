// Thread titles (#86): the clean-up of whatever the title model answers. No network, LLM or database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanTitle } from '../src/titles.ts'

test('a plain title passes through', () => {
  assert.equal(cleanTitle('Kirim NEAR ke Ancung'), 'Kirim NEAR ke Ancung')
})

test('quotes, a label, a final period and extra lines are dropped', () => {
  assert.equal(cleanTitle('"Weekly team sync."'), 'Weekly team sync')
  assert.equal(cleanTitle('Title: Pay the coffee bill'), 'Pay the coffee bill')
  assert.equal(cleanTitle('**Cek email penting**\n\nThis title sums up the chat.'), 'Cek email penting')
  assert.equal(cleanTitle('<think>the user wants…</think>\nBalance check'), 'Balance check')
})

test('empty answers give no title, long ones are cut', () => {
  assert.equal(cleanTitle(''), null)
  assert.equal(cleanTitle('  \n " " '), null)
  const long = cleanTitle('word '.repeat(30))!
  assert.ok(long.length <= 61 && long.endsWith('…'))
})
