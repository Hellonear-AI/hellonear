import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handle, PROTOCOL_VERSIONS, type Reply } from '../lib/mcp'

const call = (method: string, params?: object, id: number | string = 1) => handle({ jsonrpc: '2.0', id, method, params }) as Reply
const result = (r: Reply) => r.result as { content: { type: string; text: string }[]; isError?: boolean; structuredContent?: { results: { path: string }[] } }

test('initialize answers the asked protocol version when known, else the newest', () => {
  const r = call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } })
  assert.deepEqual((r.result as { protocolVersion: string }).protocolVersion, '2025-03-26')
  assert.deepEqual((r.result as { capabilities: object }).capabilities, { tools: { listChanged: false } })
  assert.equal((call('initialize', { protocolVersion: '1999-01-01' }).result as { protocolVersion: string }).protocolVersion, PROTOCOL_VERSIONS[0])
})

test('notifications get no answer; ping answers {}', () => {
  assert.equal(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null)
  assert.deepEqual(call('ping', undefined, 'a'), { jsonrpc: '2.0', id: 'a', result: {} })
})

test('tools/list offers search_docs and read_page, both read-only', () => {
  const tools = (call('tools/list').result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools
  assert.deepEqual(tools.map((t) => t.name), ['search_docs', 'read_page'])
  assert.ok(tools.every((t) => t.annotations.readOnlyHint))
})

test('search_docs returns ranked pages as text and structured content', () => {
  const r = result(call('tools/call', { name: 'search_docs', arguments: { query: 'payments csv', limit: 2 } }))
  assert.equal(r.structuredContent!.results.length, 2)
  assert.equal(r.structuredContent!.results[0].path, '/payments-csv')
  assert.match(r.content[0].text, /^1\. Payments CSV\n/)
  assert.match(result(call('tools/call', { name: 'search_docs', arguments: { query: 'zzzqqq' } })).content[0].text, /No pages match/)
})

test('read_page returns the page as Markdown, or an error result for an unknown path', () => {
  const r = result(call('tools/call', { name: 'read_page', arguments: { path: '/trust/faq' } }))
  assert.match(r.content[0].text, /^# FAQ\n\n> /)
  assert.match(r.content[0].text, /Source: https:\/\/docs\.hellonear\.xyz\/trust\/faq/)
  const miss = result(call('tools/call', { name: 'read_page', arguments: { path: '/nope' } }))
  assert.equal(miss.isError, true)
})

test('bad requests get JSON-RPC errors', () => {
  assert.equal(call('tools/call', { name: 'search_docs', arguments: {} }).error?.code, -32602)
  assert.equal(call('tools/call', { name: 'delete_everything', arguments: {} }).error?.code, -32602)
  assert.equal(call('resources/list').error?.code, -32601)
  assert.equal(handle([{ jsonrpc: '2.0', id: 1, method: 'ping' }])?.error?.code, -32600)
  assert.equal(handle({ id: 1, method: 'ping' })?.error?.code, -32600)
})
