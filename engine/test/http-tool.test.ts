// http_request against real hosts (needs internet, no database or LLM).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RequestContext } from '@mastra/core/request-context'
import { REDACTED, SECRETS_KEY, type Secret } from '../src/secrets.ts'
import { toolRegistry } from '../src/tools.ts'

const VALUE = `sk_test_${crypto.randomUUID()}`
const ctx = () => {
  const rc = new RequestContext()
  rc.set(SECRETS_KEY, new Map<string, Secret>([['SHOP_API_KEY', { name: 'SHOP_API_KEY', value: VALUE, allowedHosts: ['httpbin.org'] }]]))
  return { requestContext: rc } as any
}
const run = (input: Record<string, unknown>) => toolRegistry.http_request.execute!(input as any, ctx()) as Promise<any>

test('a secret echoed back by the API is redacted before the model sees it', async () => {
  const out = await run({ method: 'GET', url: 'https://httpbin.org/headers', headers: { 'X-Api-Key': '{{secrets.SHOP_API_KEY}}' } })
  assert.equal(out.status, 200)
  assert.ok(out.body.includes(REDACTED), 'httpbin echoed the header, shown redacted')
  assert.ok(!JSON.stringify(out).includes(VALUE), 'secret value never in the result')
})

test('a secret cannot go to a host it is not allowed for', async () => {
  await assert.rejects(run({ method: 'GET', url: 'https://example.com/', headers: { Authorization: '{{secrets.SHOP_API_KEY}}' } }), /may not be sent to example.com/)
})

test('hostnames that resolve to private addresses are refused (localtest.me → 127.0.0.1)', async () => {
  await assert.rejects(run({ method: 'GET', url: 'https://localtest.me/' }), /resolves to a non-public address/)
})

test('redirects are not followed, so secrets cannot be forwarded', async () => {
  const out = await run({ method: 'GET', url: 'https://httpbin.org/redirect-to?url=https%3A%2F%2Fexample.com', headers: { 'X-Api-Key': '{{secrets.SHOP_API_KEY}}' } })
  assert.equal(out.status, 302)
  assert.equal(out.location, 'https://example.com')
})

test('unknown secrets are an error, not an empty string', async () => {
  await assert.rejects(run({ method: 'GET', url: 'https://httpbin.org/get', headers: { 'X-Key': '{{secrets.MISSING}}' } }), /unknown secret MISSING/)
})
