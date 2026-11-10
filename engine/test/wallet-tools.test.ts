// Payment tools (#42) against a fake backend: headers, bodies, errors. No network, LLM or database.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { toolRegistry } from '../src/tools.ts'
import { WALLET_KEY, walletContext } from '../src/wallet.ts'

const TOKEN = 'wt_test.abc'
const seen: { method: string; url: string; headers: IncomingMessage['headers']; body: string }[] = []
const backend = createServer(async (req, res) => {
  let body = ''
  for await (const c of req) body += c
  seen.push({ method: req.method!, url: req.url!, headers: req.headers, body })
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.headers['x-wallet-token'] === 'wt_expired') return send(401, { error: 'wallet_token_expired' })
  if (req.url === '/internal/v1/wallet/send_payment') {
    const { to, amountNear } = JSON.parse(body)
    if (to === 'stranger.testnet') return send(200, { paymentId: 'p2', status: 'policy_denied', to, amountNear, message: "Address 'stranger.testnet' is not in whitelist" })
    return send(200, { paymentId: 'p1', status: 'sent', to, amountNear, txHash: 'TxHash111' })
  }
  if (req.url === '/internal/v1/wallet/balance') return send(200, { address: 'abc123', balanceNear: '0.98' })
  if (req.url?.startsWith('/internal/v1/wallet/payments')) return send(200, { payments: [{ paymentId: 'p1', status: 'sent', to: 'shop.testnet', amountNear: '0.01', txHash: 'TxHash111', at: '2026-11-05T00:00:00.000Z' }] })
  if (req.url?.startsWith('/internal/v1/shop/')) {
    const offer = { item: 'gas-price', title: 'Gas', priceNear: '0.001', payTo: 'shop.testnet' }
    const tx = new URL(req.url, 'http://x').searchParams.get('tx')
    if (!tx) return send(402, { status: 'payment_required', ...offer })
    if (tx.startsWith('1111')) return send(402, { error: 'payment_not_found', ...offer })
    if (tx.startsWith('2222')) return send(409, { error: 'payment_already_used' })
    return send(200, { status: 'paid', item: 'gas-price', title: 'Gas', data: { gasPriceYocto: '100000000' }, receipt: { txHash: tx, paymentId: 'p1', amountNear: '0.001' } })
  }
  send(404, { error: 'not_found' })
})

before(async () => {
  await new Promise<void>((r) => backend.listen(0, '127.0.0.1', r))
  process.env.BACKEND_URL = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`
  process.env.ENGINE_API_KEY ??= 'engine-key-for-tests'
})
after(() => new Promise<void>((r) => backend.close(() => r())))

const ctx = (token?: string) => ({ requestContext: { get: (k: string) => (k === WALLET_KEY ? walletContext(token) : undefined) } })
const run = (tool: keyof typeof toolRegistry, input: unknown, token?: string) => toolRegistry[tool].execute!(input as any, ctx(token) as any) as Promise<any>

test('send_payment posts to the backend with the engine key and the wallet token', async () => {
  const out = await run('send_payment', { to: 'shop.testnet', amountNear: '0.01' }, TOKEN)
  assert.deepEqual(out, { paymentId: 'p1', status: 'sent', to: 'shop.testnet', amountNear: '0.01', txHash: 'TxHash111' })
  const call = seen.at(-1)!
  assert.equal(call.method, 'POST')
  assert.equal(call.headers['x-wallet-token'], TOKEN)
  assert.equal(call.headers['x-engine-key'], process.env.ENGINE_API_KEY)
  assert.deepEqual(JSON.parse(call.body), { to: 'shop.testnet', amountNear: '0.01' })
})

test('a policy refusal is a result with no txHash, not a thrown error', async () => {
  const out = await run('send_payment', { to: 'stranger.testnet', amountNear: '0.01' }, TOKEN)
  assert.equal(out.status, 'policy_denied')
  assert.equal(out.txHash, undefined)
  assert.match(out.message, /whitelist/)
})

test('get_balance and list_payments read the backend', async () => {
  assert.deepEqual(await run('get_balance', {}, TOKEN), { address: 'abc123', balanceNear: '0.98' })
  const { payments } = await run('list_payments', { limit: 5 }, TOKEN)
  assert.equal(payments[0].txHash, 'TxHash111')
  assert.equal(seen.at(-1)!.url, '/internal/v1/wallet/payments?limit=5')
})

test('without a wallet token the tools answer "no wallet yet" and never call the backend', async () => {
  const before = seen.length
  for (const [tool, input] of [['send_payment', { to: 'shop.testnet', amountNear: '0.01' }], ['get_balance', {}], ['list_payments', {}]] as const) {
    await assert.rejects(run(tool, input), /no wallet yet/)
  }
  assert.equal(seen.length, before)
})

test('backend errors surface with their code', async () => {
  await assert.rejects(run('get_balance', {}, 'wt_expired'), /401 wallet_token_expired/)
})

test('bad amounts and accounts never reach the backend', async () => {
  const validate = (input: unknown) => toolRegistry.send_payment.inputSchema!['~standard'].validate(input) as any
  for (const amountNear of ['0', '0.0', '-1', '1e3', '0.01 NEAR', '1000']) assert.ok((await validate({ to: 'shop.testnet', amountNear })).issues?.length, amountNear)
  assert.ok((await validate({ to: 'Bad..ID', amountNear: '0.01' })).issues?.length)
  assert.ok(!(await validate({ to: 'shop.testnet', amountNear: '0.01' })).issues)
})

test('buy_data (#150): 402 becomes payment_required, then paid with a receipt; unknown and reused hashes are answers', async () => {
  const hash = (c: string) => c.repeat(4) + 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQ'
  assert.deepEqual(await run('buy_data', { item: 'gas-price' }, TOKEN), { status: 'payment_required', item: 'gas-price', title: 'Gas', priceNear: '0.001', payTo: 'shop.testnet' })
  assert.equal(seen.at(-1)!.url, '/internal/v1/shop/gas-price')
  assert.equal(seen.at(-1)!.headers['x-wallet-token'], TOKEN)
  const paid = await run('buy_data', { item: 'gas-price', paymentTxHash: hash('9') }, TOKEN)
  assert.deepEqual([paid.status, paid.receipt.txHash, paid.data], ['paid', hash('9'), { gasPriceYocto: '100000000' }])
  assert.equal(seen.at(-1)!.url, `/internal/v1/shop/gas-price?tx=${hash('9')}`)
  const unknown = await run('buy_data', { item: 'gas-price', paymentTxHash: hash('1') }, TOKEN)
  assert.deepEqual([unknown.status, unknown.reason], ['payment_required', 'no payment from this Mind with that hash in the last hour'])
  assert.equal((await run('buy_data', { item: 'gas-price', paymentTxHash: hash('2') }, TOKEN)).status, 'refused')
  await assert.rejects(run('buy_data', { item: 'gas-price' }), /no wallet yet/)
})
