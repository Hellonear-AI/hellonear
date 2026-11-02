// Unit tests for secret templating, host rules, SSRF guard and redaction (no network).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REDACTED, assertHostAllowed, assertPublicHttpsUrl, fillSecrets, redact, secretSchema, type Secret } from '../src/secrets.ts'

const secrets = new Map<string, Secret>([['SHOP_API_KEY', { name: 'SHOP_API_KEY', value: 'sk_live_abc123', allowedHosts: ['api.shop.com'] }]])

test('placeholders are filled and recorded', () => {
  const used = new Set<string>()
  assert.equal(fillSecrets('Bearer {{secrets.SHOP_API_KEY}}', secrets, used), 'Bearer sk_live_abc123')
  assert.equal(fillSecrets('Bearer {{ secrets.SHOP_API_KEY }}', secrets, used), 'Bearer sk_live_abc123')
  assert.deepEqual([...used], ['SHOP_API_KEY'])
  assert.equal(fillSecrets('no secrets here', secrets, new Set()), 'no secrets here')
  assert.throws(() => fillSecrets('{{secrets.NOPE}}', secrets, new Set()), /unknown secret NOPE/)
})

test('a secret only goes to its allowed hosts', () => {
  assert.doesNotThrow(() => assertHostAllowed('api.shop.com', ['SHOP_API_KEY'], secrets))
  assert.doesNotThrow(() => assertHostAllowed('API.SHOP.COM', ['SHOP_API_KEY'], secrets))
  assert.throws(() => assertHostAllowed('evil.com', ['SHOP_API_KEY'], secrets), /may not be sent to evil.com/)
  assert.doesNotThrow(() => assertHostAllowed('evil.com', [], secrets), 'no secret used, any public host is fine')
})

test('only public https URLs are allowed', () => {
  assert.equal(assertPublicHttpsUrl('https://httpbin.org/get').hostname, 'httpbin.org')
  for (const bad of ['http://httpbin.org', 'https://localhost:4100/v1/health', 'https://127.0.0.1', 'https://10.0.0.5', 'https://169.254.169.254/latest/meta-data', 'https://192.168.1.1', 'https://172.20.0.1', 'https://[::1]/', 'https://db.internal', 'ftp://x.com']) {
    assert.throws(() => assertPublicHttpsUrl(bad), Error, bad)
  }
})

test('redaction replaces secret values anywhere, longest first', () => {
  const out = redact({ a: 'x sk_live_abc123 y', b: ['sk_live_abc123'], c: { d: 'sk_live_abc' }, n: 3 }, ['sk_live_abc', 'sk_live_abc123'])
  assert.deepEqual(out, { a: `x ${REDACTED} y`, b: [REDACTED], c: { d: REDACTED }, n: 3 })
  assert.deepEqual(redact({ a: 'x' }, []), { a: 'x' })
})

test('secret definitions are validated', () => {
  assert.ok(secretSchema.safeParse({ name: 'SHOP_API_KEY', value: 'abcd', allowedHosts: ['a.com'] }).success)
  assert.ok(!secretSchema.safeParse({ name: 'shop', value: 'abcd', allowedHosts: ['a.com'] }).success)
  assert.ok(!secretSchema.safeParse({ name: 'SHOP', value: 'abcd', allowedHosts: [] }).success)
})
