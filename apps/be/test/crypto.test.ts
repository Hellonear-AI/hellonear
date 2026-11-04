// Offline unit tests for secret encryption.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { decrypt, encrypt, newId } from '../src/crypto.ts'

const key = randomBytes(32)

test('round trip, and the ciphertext does not contain the value', () => {
  const c = encrypt(key, 'sk-live-123456', 'usr_1:SHOP_API_KEY')
  assert.equal(decrypt(key, c, 'usr_1:SHOP_API_KEY'), 'sk-live-123456')
  assert.ok(!Buffer.from(c, 'base64').toString('latin1').includes('sk-live'))
  assert.notEqual(encrypt(key, 'sk-live-123456', 'usr_1:SHOP_API_KEY'), c, 'a fresh IV every time')
})

test('a row moved to another user or name, a wrong key, or a tampered ciphertext fails to decrypt', () => {
  const c = encrypt(key, 'value-1', 'usr_1:A')
  assert.throws(() => decrypt(key, c, 'usr_2:A'))
  assert.throws(() => decrypt(key, c, 'usr_1:B'))
  assert.throws(() => decrypt(randomBytes(32), c, 'usr_1:A'))
  const raw = Buffer.from(c, 'base64')
  raw[raw.length - 1] ^= 1
  assert.throws(() => decrypt(key, raw.toString('base64'), 'usr_1:A'))
})

test('ids fit the engine mindId format', () => {
  assert.match(newId('mnd'), /^[A-Za-z0-9_]+(-[A-Za-z0-9_]+)*$/)
})
