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
  // Mind as Seller (#181).
  if (req.url === '/internal/v1/offers/weekly-digest' && req.method === 'PUT') return send(200, { sellerMindId: 'mnd_' + 'a'.repeat(24), item: 'weekly-digest', ...JSON.parse(body), content: undefined, payTo: 'f'.repeat(64) })
  if (req.url?.startsWith('/internal/v1/minds/')) {
    const u = new URL(req.url, 'http://x')
    const offer = { status: 'payment_required', sellerMindId: 'mnd_' + 'a'.repeat(24), item: 'weekly-digest', title: 'Digest', priceNear: '0.002', payTo: 'f'.repeat(64) }
    if (!u.pathname.endsWith('/weekly-digest')) return send(404, { error: 'no_offer' })
    const tx = u.searchParams.get('tx')
    if (!tx) return send(402, offer)
    if (tx.startsWith('2222')) return send(409, { error: 'payment_already_used' })
    return send(200, { ...offer, status: 'paid', content: 'Three things.', receipt: { txHash: tx, paymentId: 'p9', amountNear: '0.002', payTo: 'f'.repeat(64) } })
  }
  if (req.url?.startsWith('/internal/v1/shop/')) {
    const q = new URL(req.url, 'http://x').searchParams
    // Best Price Buyer (#176): s2 is cheapest but off the wallet's list, s1 is next.
    if (q.get('quotes') === '1') return send(200, { status: 'quotes', item: 'gas-price', title: 'Gas', quotes: [
      { seller: 's2', payTo: 'cheap.testnet', priceNear: '0.0008', onYourList: false }, { seller: 's1', payTo: 'shop.testnet', priceNear: '0.001', onYourList: true }, { seller: 's3', payTo: 'dear.testnet', priceNear: '0.0013', onYourList: true }] })
    if (q.get('seller') === 's9') return send(404, { error: 'unknown_seller' })
    // Negotiation: s3 asks 0.0013, takes 0.0011 or more, and otherwise counters at 0.0011.
    if (q.get('offer') && !q.get('tx')) {
      if (q.get('seller') !== 's3') return send(400, { error: 'offer_not_taken' })
      return Number(q.get('offer')) >= 0.0011
        ? send(200, { status: 'accepted', seller: 's3', priceNear: q.get('offer'), payTo: 'dear.testnet', reason: 'fair enough' })
        : send(200, { status: 'countered', seller: 's3', priceNear: '0.0011', payTo: 'dear.testnet', reason: 'my last price' })
    }
    if (q.get('seller') === 's3' && !q.get('tx')) return send(402, { status: 'payment_required', item: 'gas-price', title: 'Gas', seller: 's3', priceNear: '0.0013', payTo: 'dear.testnet' })
    const offer = { item: 'gas-price', title: 'Gas', priceNear: '0.001', payTo: 'shop.testnet' }
    const tx = q.get('tx')
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

test('after a send_payment error, the next one in the same request is answered without an approval card', async () => {
  const before = toolRegistry.send_payment.beforeApproval!
  const input = { to: 'bob.testnet', amountNear: '0.01' }
  // One request context per request, holding its wallet Map, as src/server.ts builds it.
  const request = (token: string) => ({ requestContext: new Map<string, unknown>([[WALLET_KEY, walletContext(token)]]) })
  const hook = (c: any) => before(input, { toolCallId: 't1', toolName: 'send_payment', requestContext: Object.fromEntries(c.requestContext.entries()) })
  // Same request: a failed payment marks its own wallet Map, which beforeApproval reads through the plain view.
  const failing = request('wt_expired') as any
  assert.equal(await hook(failing), undefined, 'first payment goes to approval')
  await assert.rejects(toolRegistry.send_payment.execute!(input as any, failing), /401/)
  const out: any = await hook(failing)
  assert.equal(out?.proceed, false)
  assert.equal(out?.output.status, 'failed')
  assert.match(out?.output.message, /already failed/)
  // A new request starts clean, and a sent payment never blocks the next one.
  assert.equal(await hook(request(TOKEN)), undefined)
  const ok = request(TOKEN) as any
  await toolRegistry.send_payment.execute!(input as any, ok)
  assert.equal(await hook(ok), undefined)
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

test('get_quotes (#176): every seller, cheapest first, and the cheapest the wallet may pay; nothing is paid', async () => {
  const before = seen.length
  const out = await run('get_quotes', { item: 'gas-price' }, TOKEN)
  assert.equal(seen.length, before + 1, 'one read, no payment')
  assert.equal(seen.at(-1)!.url, '/internal/v1/shop/gas-price?quotes=1')
  assert.equal(seen.at(-1)!.headers['x-wallet-token'], TOKEN)
  assert.deepEqual(out.quotes.map((q: any) => q.seller), ['s2', 's1', 's3'])
  assert.deepEqual(out.cheapestOnYourList, { seller: 's1', payTo: 'shop.testnet', priceNear: '0.001', onYourList: true })
  await assert.rejects(run('get_quotes', { item: 'gas-price' }), /no wallet yet/)
})

test('buy_data with a seller (#176) asks for that seller; an unknown seller is a refusal, not a crash', async () => {
  const offer = await run('buy_data', { item: 'gas-price', seller: 's3' }, TOKEN)
  assert.equal(seen.at(-1)!.url, '/internal/v1/shop/gas-price?seller=s3')
  assert.deepEqual(offer, { status: 'payment_required', item: 'gas-price', title: 'Gas', seller: 's3', priceNear: '0.0013', payTo: 'dear.testnet' })
  const hash = '9999abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQ'
  await run('buy_data', { item: 'gas-price', seller: 's1', paymentTxHash: hash }, TOKEN)
  assert.equal(seen.at(-1)!.url, `/internal/v1/shop/gas-price?seller=s1&tx=${hash}`)
  const unknown = await run('buy_data', { item: 'gas-price', seller: 's9' }, TOKEN)
  assert.equal(unknown.status, 'refused')
  assert.match(unknown.reason, /no such seller/)
  const validate = (input: unknown) => toolRegistry.buy_data.inputSchema!['~standard'].validate(input) as any
  assert.ok((await validate({ item: 'gas-price', seller: 'cheap.testnet' })).issues?.length, 'a seller is an id, never an account')
})

test('near_check_transfer (#180) reads one transaction from the RPC: signer, receiver, NEAR moved, success', async () => {
  const calls: any[] = []
  const rpc = createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const { params } = JSON.parse(raw)
    calls.push(params)
    const send = (json: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(json))
    if (params.tx_hash.startsWith('1111')) return send({ error: { cause: { name: 'UNKNOWN_TRANSACTION' }, message: 'not found' } })
    const failed = params.tx_hash.startsWith('2222')
    send({ result: { status: failed ? { Failure: {} } : { SuccessValue: '' }, transaction: { signer_id: params.sender_account_id, receiver_id: 'mind.testnet', actions: [{ Transfer: { deposit: '1500000000000000000000' } }, { Transfer: { deposit: '1000000000000000000000' } }] } } })
  })
  await new Promise<void>((r) => rpc.listen(0, '127.0.0.1', r))
  const before = process.env.NEAR_RPC_URL
  process.env.NEAR_RPC_URL = `http://127.0.0.1:${(rpc.address() as AddressInfo).port}`
  try {
    const hash = (c: string) => c.repeat(4) + 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQ'
    const ok = await run('near_check_transfer', { txHash: hash('9'), senderId: 'client.testnet', amountNear: '0.0025' })
    assert.deepEqual(ok, { txHash: hash('9'), status: 'succeeded', signerId: 'client.testnet', receiverId: 'mind.testnet', transferredNear: '0.0025', coversAmount: true })
    assert.deepEqual(calls.at(-1), { tx_hash: hash('9'), sender_account_id: 'client.testnet', wait_until: 'FINAL' })
    // With a wallet, the tool compares the receiver with this Mind's own address (the fake backend's is abc123) and the amount.
    const checked = await run('near_check_transfer', { txHash: hash('9'), senderId: 'client.testnet', amountNear: '0.0025' }, TOKEN)
    assert.deepEqual([checked.toThisMindsWallet, checked.coversAmount], [false, true])
    assert.equal((await run('near_check_transfer', { txHash: hash('9'), senderId: 'client.testnet', amountNear: '0.003' })).coversAmount, false)
    assert.equal((await run('near_check_transfer', { txHash: hash('2'), senderId: 'client.testnet', amountNear: '0.0025' })).status, 'failed')
    await assert.rejects(run('near_check_transfer', { txHash: hash('1'), senderId: 'client.testnet', amountNear: '0.0025' }), /UNKNOWN_TRANSACTION/)
  } finally {
    if (before === undefined) delete process.env.NEAR_RPC_URL
    else process.env.NEAR_RPC_URL = before
    await new Promise<void>((r) => rpc.close(() => r()))
  }
})

test('sell_offer and buy_from_mind (#181): publish waits for approval; buying is 402, then paid once', async () => {
  assert.equal(toolRegistry.sell_offer.requireApproval, true)
  assert.notEqual((toolRegistry.buy_from_mind as { requireApproval?: boolean }).requireApproval, true)
  const seller = 'mnd_' + 'a'.repeat(24)
  const put = await run('sell_offer', { item: 'weekly-digest', title: 'Digest', priceNear: '0.002', content: 'Three things.' }, TOKEN)
  assert.equal(seen.at(-1)!.method, 'PUT')
  assert.deepEqual(JSON.parse(seen.at(-1)!.body), { title: 'Digest', priceNear: '0.002', content: 'Three things.' })
  assert.deepEqual([put.sellerMindId, put.payTo], [seller, 'f'.repeat(64)])
  // The line the playbook copies, so buyers always get the full seller Mind id.
  assert.equal(put.forBuyers, `To buy it, another Mind asks for seller Mind ${seller}, item weekly-digest (0.002 NEAR).`)
  const offer = await run('buy_from_mind', { sellerMindId: seller, item: 'weekly-digest' }, TOKEN)
  assert.deepEqual([offer.status, offer.priceNear, offer.payTo], ['payment_required', '0.002', 'f'.repeat(64)])
  assert.equal(seen.at(-1)!.url, `/internal/v1/minds/${seller}/offers/weekly-digest`)
  const hash = (c: string) => c.repeat(4) + 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQ'
  const paid = await run('buy_from_mind', { sellerMindId: seller, item: 'weekly-digest', paymentTxHash: hash('9') }, TOKEN)
  assert.deepEqual([paid.status, paid.content, paid.receipt.txHash], ['paid', 'Three things.', hash('9')])
  assert.equal((await run('buy_from_mind', { sellerMindId: seller, item: 'weekly-digest', paymentTxHash: hash('2') }, TOKEN)).status, 'refused')
  assert.match((await run('buy_from_mind', { sellerMindId: seller, item: 'nothing' }, TOKEN)).reason, /sells nothing/)
  const validate = (input: unknown) => toolRegistry.buy_from_mind.inputSchema!['~standard'].validate(input) as any
  assert.ok((await validate({ sellerMindId: 'alice.testnet', item: 'weekly-digest' })).issues?.length, 'a seller is a Mind id, never an account')
  await assert.rejects(run('sell_offer', { item: 'weekly-digest', title: 't', priceNear: '0.002', content: 'c' }), /no wallet yet/)
})

test('make_offer (negotiation) sends one offer within the budget; the tool, not the model, says buy or walk away', async () => {
  const offer = (offerNear: string, maxNear: string, seller = 's3') => run('make_offer', { item: 'gas-price', seller, offerNear, maxNear }, TOKEN)
  const accepted = await offer('0.0012', '0.0012')
  assert.equal(seen.at(-1)!.url, '/internal/v1/shop/gas-price?seller=s3&offer=0.0012')
  assert.deepEqual(accepted, { status: 'accepted', item: 'gas-price', seller: 's3', priceNear: '0.0012', payTo: 'dear.testnet', next: 'buy_at_price', reason: 'fair enough' })
  const counterInBudget = await offer('0.0009', '0.00110')
  assert.equal(counterInBudget.status, 'countered')
  assert.equal(counterInBudget.priceNear, '0.0011')
  assert.equal(counterInBudget.next, 'buy_at_price', 'a counter at the budget is still a buy (compared in yoctoNEAR)')
  assert.equal((await offer('0.0009', '0.001')).next, 'walk_away')
  const before = seen.length
  const over = await offer('0.002', '0.001')
  assert.equal(over.status, 'refused')
  assert.equal(seen.length, before, 'an offer above the budget never reaches the seller')
  assert.equal((await offer('0.0009', '0.001', 's9')).status, 'refused')
  const notTaken = await offer('0.0009', '0.001', 's1')
  assert.equal(notTaken.status, 'refused')
  assert.match(notTaken.reason, /offer_not_taken/)
  const validate = (input: unknown) => toolRegistry.make_offer.inputSchema!['~standard'].validate(input) as any
  for (const offerNear of ['0', '-1', '1e-3', '0.001 NEAR']) assert.ok((await validate({ item: 'gas-price', seller: 's3', offerNear, maxNear: '0.001' })).issues?.length, offerNear)
  await assert.rejects(run('make_offer', { item: 'gas-price', seller: 's3', offerNear: '0.001', maxNear: '0.001' }), /no wallet yet/)
})

test('buy_data at an agreed price: the shop\'s acceptance is the price to pay; the tx call carries the offer', async () => {
  const due = await run('buy_data', { item: 'gas-price', seller: 's3', offerNear: '0.0012' }, TOKEN)
  assert.deepEqual(due, { status: 'payment_required', item: 'gas-price', seller: 's3', priceNear: '0.0012', payTo: 'dear.testnet' })
  const low = await run('buy_data', { item: 'gas-price', seller: 's3', offerNear: '0.0009' }, TOKEN)
  assert.equal(low.status, 'refused')
  assert.equal(low.priceNear, '0.0011')
  const hash = '9999abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQ'
  await run('buy_data', { item: 'gas-price', seller: 's3', offerNear: '0.0011', paymentTxHash: hash }, TOKEN)
  assert.equal(seen.at(-1)!.url, `/internal/v1/shop/gas-price?seller=s3&offer=0.0011&tx=${hash}`)
  const before = seen.length
  assert.equal((await run('buy_data', { item: 'gas-price', offerNear: '0.0011' }, TOKEN)).status, 'refused')
  assert.equal(seen.length, before, 'an agreed price without its seller never reaches the shop')
})

test('after a walk-away, buy_data refuses that item for the rest of the request', async () => {
  // One request: one wallet Map, as the server builds it per run.
  const map = walletContext(TOKEN)
  const c = { requestContext: { get: (k: string) => (k === WALLET_KEY ? map : undefined) } }
  const exec = (tool: keyof typeof toolRegistry, input: unknown) => toolRegistry[tool].execute!(input as any, c as any) as Promise<any>
  assert.equal((await exec('make_offer', { item: 'gas-price', seller: 's3', offerNear: '0.0009', maxNear: '0.001' })).next, 'walk_away')
  const before = seen.length
  const out = await exec('buy_data', { item: 'gas-price', seller: 's1' })
  assert.equal(out.status, 'refused')
  assert.match(out.reason, /budget/)
  assert.equal(seen.length, before)
  assert.equal((await exec('buy_data', { item: 'network-status' })).status, 'payment_required', 'only that item')
})

test('near_view_account says whether an account is a contract, from its code hash', async () => {
  const rpc = createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const id = JSON.parse(raw).params.account_id
    const codeHash = id === 'registry.testnet' ? 'GUxsMNJdJKoFq7VJawNeCwW7GjGZE6TpURPj13ojEnub' : '11111111111111111111111111111111'
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ result: { amount: '4490000000000000000000000', storage_usage: 190370, code_hash: codeHash } }))
  })
  await new Promise<void>((r) => rpc.listen(0, '127.0.0.1', r))
  const old = process.env.NEAR_RPC_URL
  process.env.NEAR_RPC_URL = `http://127.0.0.1:${(rpc.address() as AddressInfo).port}`
  try {
    const contract = await run('near_view_account', { accountId: 'registry.testnet' })
    assert.equal(contract.isContract, true)
    assert.equal(contract.codeHash, 'GUxsMNJdJKoFq7VJawNeCwW7GjGZE6TpURPj13ojEnub')
    assert.equal(contract.balanceNear, 4.49)
    const person = await run('near_view_account', { accountId: 'alice.testnet' })
    assert.equal(person.isContract, false)
  } finally {
    if (old === undefined) delete process.env.NEAR_RPC_URL
    else process.env.NEAR_RPC_URL = old
    await new Promise<void>((r) => rpc.close(() => r()))
  }
})
