// Cross-chain quote (NEAR Intents 1Click, dry run) against a fake 1Click and a fake backend. No network, LLM or database.
// Run: node --import tsx --test test/crosschain.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { toolRegistry } from '../src/tools.ts'
import { WALLET_KEY, walletContext } from '../src/wallet.ts'
import { readFileSync } from 'node:fs'
import { chainId, costOf, fromUnits, proofOf, resetTokenCache, toUnits } from '../src/crosschain.ts'

const USDC_NEAR = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'
const USDC_BASE = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near'
const USDC_BSC = 'nep141:bnb-0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d.omdep.near'
// From GET /v0/tokens on 12 Nov (USDC on BNB Chain has 18 decimals).
const TOKENS = [
  { assetId: USDC_NEAR, decimals: 6, blockchain: 'near', symbol: 'USDC' },
  { assetId: USDC_BASE, decimals: 6, blockchain: 'base', symbol: 'USDC' },
  { assetId: USDC_BSC, decimals: 18, blockchain: 'bsc', symbol: 'USDC' },
  { assetId: 'nep141:usdt.tether-token.near', decimals: 6, blockchain: 'near', symbol: 'USDT' },
]
const BASE_ADDR = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'
const BAD_ADDR = '0x' + 'f'.repeat(40)

const quotes: any[] = []
const oneClick = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.url === '/v0/tokens') return send(200, TOKENS)
  if (req.url !== '/v0/quote') return send(404, {})
  const body = JSON.parse(raw)
  quotes.push(body)
  if (body.recipient === BAD_ADDR) return send(400, { message: 'recipient is not valid' })
  // The shape of a live dry answer (12 Nov): 10 USDC on NEAR -> 9.99558 on Base.
  const out = body.destinationAsset === USDC_BSC ? '9995580000000000000' : '9995580'
  const min = body.destinationAsset === USDC_BSC ? '9895624000000000000' : '9895624'
  send(201, { quote: { amountIn: body.amount, amountInFormatted: '10.0', amountOut: out, minAmountOut: min, timeEstimate: 22 }, correlationId: 'q-1', timestamp: '2026-11-12T12:54:15.113Z' })
})
const backend = createServer((req, res) => {
  if (req.url === '/internal/v1/wallet/balance') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ address: 'a'.repeat(64), balanceNear: '1' }))
  res.writeHead(404).end('{}')
})

before(async () => {
  await new Promise<void>((r) => oneClick.listen(0, '127.0.0.1', r))
  await new Promise<void>((r) => backend.listen(0, '127.0.0.1', r))
  process.env.ONECLICK_URL = `http://127.0.0.1:${(oneClick.address() as AddressInfo).port}`
  process.env.BACKEND_URL = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`
  process.env.ENGINE_API_KEY ??= 'engine-key-for-tests'
  resetTokenCache()
})
after(async () => {
  await new Promise<void>((r) => oneClick.close(() => r()))
  await new Promise<void>((r) => backend.close(() => r()))
})

const ctx = (token?: string) => ({ requestContext: { get: (k: string) => (k === WALLET_KEY ? walletContext(token) : undefined) } })
const run = (input: unknown, token: string | undefined = 'wt_test.abc') => toolRegistry.crosschain_quote.execute!(input as any, ctx(token) as any) as Promise<any>

test('amounts are converted with BigInt, never floats', () => {
  assert.equal(toUnits('10', 6), 10_000_000n)
  assert.equal(toUnits('2.5', 18), 2_500_000_000_000_000_000n)
  assert.throws(() => toUnits('0.0000001', 6), /at most 6 decimals/)
  assert.equal(fromUnits(9_995_580n, 6), '9.99558')
  assert.equal(fromUnits(10_000_000n, 6), '10')
  assert.equal(costOf(10_000_000n, 6, 9_995_580_000_000_000_000n, 18), '0.00442')
  assert.equal(chainId('Arbitrum'), 'arb')
  assert.equal(chainId('BNB Chain'), 'bsc')
  assert.equal(chainId('base'), 'base')
})

test('a dry quote: USDC on NEAR to Base, refunds to the Mind\'s own wallet, nothing to deposit', async () => {
  const out = await run({ token: 'USDC', amount: '10', toChain: 'Base', recipient: BASE_ADDR })
  const sent = quotes.at(-1)
  assert.equal(sent.dry, true, 'never a live quote')
  assert.equal(sent.swapType, 'EXACT_INPUT')
  assert.equal(sent.originAsset, USDC_NEAR)
  assert.equal(sent.destinationAsset, USDC_BASE)
  assert.equal(sent.amount, '10000000')
  assert.equal(sent.recipient, BASE_ADDR)
  assert.equal(sent.refundTo, 'a'.repeat(64))
  assert.deepEqual(out, {
    status: 'quote_only',
    from: { chain: 'near', token: 'USDC', amount: '10' },
    to: { chain: 'base', token: 'USDC', recipient: BASE_ADDR, amount: '9.99558', minAmount: '9.895624' },
    cost: '0.00442', seconds: 22, quoteId: 'q-1', quotedAt: '2026-11-12T12:54:15.113Z',
    proof: out.proof,
    note: out.note,
  })
  assert.match(out.note, /nothing was sent/)
  assert.equal(JSON.stringify(out).includes('depositAddress'), false)
})

test('different decimals on each side (USDC on BNB Chain has 18)', async () => {
  const out = await run({ token: 'USDC', amount: '10', toChain: 'bnb', recipient: BASE_ADDR })
  assert.equal(quotes.at(-1).destinationAsset, USDC_BSC)
  assert.equal(out.to.amount, '9.99558')
  assert.equal(out.cost, '0.00442')
})

test('refusals: an unknown chain lists where it can go, NEAR itself, a bad address, no wallet', async () => {
  const before = quotes.length
  await assert.rejects(run({ token: 'USDC', amount: '10', toChain: 'dogecoin', recipient: BASE_ADDR }), /no USDC on "dogecoin"\. USDC goes to: base, bsc/)
  await assert.rejects(run({ token: 'USDC', amount: '10', toChain: 'near', recipient: BASE_ADDR }), /send_payment/)
  await assert.rejects(run({ token: 'USDC', amount: '0', toChain: 'base', recipient: BASE_ADDR }), /more than 0/)
  await assert.rejects(run({ token: 'USDC', amount: '10', toChain: 'base', recipient: BASE_ADDR }, ''), /no wallet yet/)
  assert.equal(quotes.length, before, 'none of those asked for a quote')
})

test('1Click\'s own refusal comes back in its words', async () => {
  await assert.rejects(run({ token: 'USDC', amount: '10', toChain: 'base', recipient: BAD_ADDR }), /NEAR Intents: recipient is not valid/)
})

// A real dry quote recorded from 1Click on 12 Nov (test/fixtures/oneclick-dry-quote.json): its signature checks out with
// the SDK's key; any changed number does not. The fake above signs nothing, so its quotes are never called verified.
test('the proof: a real 1Click signature verifies, a changed number or a fake answer does not', async () => {
  const real = JSON.parse(readFileSync(new URL('./fixtures/oneclick-dry-quote.json', import.meta.url), 'utf8'))
  const proof = proofOf(real)
  assert.equal(proof.signedBy1Click, true)
  assert.equal(proof.signature, real.signature)
  assert.match(proof.quoteHash, /^[1-9A-HJ-NP-Za-km-z]{40,50}$/)
  assert.equal(proof.publicKey, 'ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc')
  const changed = structuredClone(real)
  changed.quote.amountOut = String(BigInt(real.quote.amountOut) + 1n)
  assert.equal(proofOf(changed).signedBy1Click, false)
  assert.equal(proofOf({ ...real, signature: undefined }).signedBy1Click, false)
  const out = await run({ token: 'USDC', amount: '10', toChain: 'base', recipient: BASE_ADDR })
  assert.equal(out.proof.signedBy1Click, false, 'the fake 1Click has no signature')
})
