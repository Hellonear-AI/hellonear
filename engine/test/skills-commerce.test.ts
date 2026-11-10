// Prompt tests for the commerce skills (#176 best-price, #179 price-watch, #180 invoice, #181 mind-seller) against real
// NEAR AI Cloud and the local Postgres. A fake backend stands in for the wallet, shop, offer and mail routes, and for
// NEAR RPC, so nothing moves on testnet.
// Run: node --env-file=.env --import tsx --test test/skills-commerce.test.ts
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { server } from '../src/server.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const userId = `test-user-${randomUUID()}`
const TOKEN = `wt_${randomUUID()}`
const MAIL_TOKEN = `mt_${randomUUID()}`
const MIND_WALLET = 'c'.repeat(64)
const SELLER_MIND = 'mnd_' + 'a'.repeat(24)
const SELLER_WALLET = 'f'.repeat(64)
const TX = 'FakeTx' + '1'.repeat(38)
const GOOD_PAYMENT = '9'.repeat(4) + 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQ'
const ELSEWHERE_PAYMENT = '8'.repeat(4) + 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQ'

type Call = { method: string; url: string; body: any }
const calls: Call[] = []
const backend = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  const body = raw ? JSON.parse(raw) : undefined
  calls.push({ method: req.method!, url: req.url!, body })
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  const u = new URL(req.url!, 'http://x')
  // NEAR RPC `tx` for near_check_transfer (NEAR_RPC_URL points here too).
  if (req.method === 'POST' && u.pathname === '/rpc') {
    const p = body.params
    const receiver = p.tx_hash === ELSEWHERE_PAYMENT ? 'someone-else.testnet' : MIND_WALLET
    return send(200, { result: { status: { SuccessValue: '' }, transaction: { signer_id: p.sender_account_id, receiver_id: receiver, actions: [{ Transfer: { deposit: '50000000000000000000000' } }] } } })
  }
  if (u.pathname === '/internal/v1/wallet/send_payment') return send(200, { paymentId: 'p-sent', status: 'sent', to: body.to, amountNear: body.amountNear, txHash: TX })
  if (u.pathname === '/internal/v1/wallet/balance') return send(200, { address: MIND_WALLET, balanceNear: '0.5' })
  if (u.pathname.startsWith('/internal/v1/wallet/payments')) return send(200, { payments: [] })
  if (u.pathname.startsWith('/internal/v1/shop/')) {
    // Three sellers: the cheapest is off this wallet's list, so the best buy is s2.
    const title = 'NEAR testnet gas price now, and the cost of a simple transfer'
    const sellers = { s3: ['offlist.testnet', '0.0005', false], s2: ['seller-b.testnet', '0.0008', true], s1: ['seller-a.testnet', '0.001', true] } as const
    if (u.searchParams.get('quotes') === '1') return send(200, { status: 'quotes', item: 'gas-price', title, quotes: Object.entries(sellers).map(([seller, [payTo, priceNear, onYourList]]) => ({ seller, payTo, priceNear, onYourList })) })
    const id = (u.searchParams.get('seller') ?? 's3') as keyof typeof sellers
    const [payTo, priceNear] = sellers[id]
    if (!u.searchParams.get('tx')) return send(402, { status: 'payment_required', item: 'gas-price', title, seller: id, priceNear, payTo })
    return send(200, { status: 'paid', item: 'gas-price', title, seller: id, data: { gasPriceYocto: '100000000', transferCostNear: '0.000045' }, receipt: { txHash: TX, paymentId: 'p-sent', amountNear: priceNear, payTo } })
  }
  if (u.pathname === '/internal/v1/offers/weekly-digest' && req.method === 'PUT') return send(200, { sellerMindId: SELLER_MIND, item: 'weekly-digest', title: body.title, priceNear: body.priceNear, payTo: SELLER_WALLET })
  if (u.pathname === `/internal/v1/minds/${SELLER_MIND}/offers/weekly-digest`) {
    const offer = { sellerMindId: SELLER_MIND, item: 'weekly-digest', title: 'Weekly gas digest', priceNear: '0.002', payTo: SELLER_WALLET }
    if (!u.searchParams.get('tx')) return send(402, { status: 'payment_required', ...offer })
    return send(200, { status: 'paid', ...offer, content: 'Gas stayed at 0.1 Ggas all week; transfers cost about 0.000045 NEAR.', receipt: { txHash: TX, paymentId: 'p-sent', amountNear: '0.002', payTo: SELLER_WALLET } })
  }
  if (u.pathname === '/internal/v1/mail/send') return send(200, { sendId: 'ms_1', status: 'sent', from: 'mind-abc123@agentmail.to', to: body.to, subject: body.subject, messageId: 'm1' })
  if (u.pathname.startsWith('/internal/v1/mail/messages')) return send(200, { inbox: 'mind-abc123@agentmail.to', shared: false, messages: [] })
  send(404, { error: 'not_found' })
})

before(async () => {
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await new Promise<void>((r) => backend.listen(0, '127.0.0.1', r))
  const b = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`
  process.env.BACKEND_URL = b
  process.env.NEAR_RPC_URL = `${b}/rpc`
})
after(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  await new Promise<void>((r) => backend.close(() => r()))
})

type Ev = Record<string, any>
async function post(path: string, body: unknown) {
  return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-key': key }, body: JSON.stringify(body) })
}
async function events(res: Response): Promise<Ev[]> {
  assert.equal(res.status, 200, await res.clone().text())
  const text = await res.text()
  return text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}
const finalText = (evs: Ev[]) => evs.find((e) => e.type === 'run.finished')?.text ?? ''
const toolsCalled = (evs: Ev[]) => evs.filter((e) => e.type === 'tool.called').map((e) => e.tool)
const mind = (name: string, skills: string[]) => ({
  templateId: 'general-assistant',
  name,
  soul: { identity: `You are ${name}, a helpful Mind.`, invariants: ['Never invent facts.'], priors: [] },
  skills: skills.map((skillId) => ({ skillId })),
})
// One chat turn; with `approve`, approves (or declines) the first approval card and returns both halves.
async function chat(m: ReturnType<typeof mind>, message: string, opts: { approve?: boolean; mail?: boolean } = {}) {
  // A fresh Mind id each time: memory is per user and Mind, so a shared id lets one test recall another's quotes.
  const threadId = randomUUID()
  const mindId = `shop-${randomUUID().slice(0, 8)}`
  const body = { userId, threadId, walletToken: TOKEN, ...(opts.mail ? { mailToken: MAIL_TOKEN } : {}), mind: m }
  const first = await events(await post(`/v1/minds/${mindId}/chat`, { ...body, message }))
  const ask = first.find((e) => e.type === 'tool.approval_required')
  if (!ask || opts.approve === undefined) return { first, ask, rest: [] as Ev[], all: first }
  const rest = await events(await post(`/v1/runs/${ask.runId}/${opts.approve ? 'approve' : 'decline'}?mindId=${mindId}`, { ...body, toolCallId: ask.toolCallId, reason: opts.approve ? undefined : 'Owner declined' }))
  return { first, ask, rest, all: [...first, ...rest] }
}
const noOnChainClaims = (text: string) => assert.ok(!/rejected on-chain|NEAR Intents|solver/i.test(text), text)

describe('commerce skills', () => {
  test('best-price (#176): compares sellers, pays the cheapest one the wallet may pay, after approval', async () => {
    const { ask, rest, all } = await chat(mind('Buyer', ['best-price']), 'Buy the gas-price report from the cheapest seller.', { approve: true })
    assert.ok(toolsCalled(all).includes('get_quotes'), JSON.stringify(toolsCalled(all)))
    assert.equal(ask?.tool, 'send_payment', 'the payment waits for the owner')
    // s3 is cheaper but off the wallet's list; s2 is the cheapest it may pay.
    assert.deepEqual(ask.args, { to: 'seller-b.testnet', amountNear: '0.0008' })
    const paid = rest.find((e) => e.type === 'tool.result' && e.tool === 'buy_data' && e.result?.status === 'paid')
    assert.ok(paid, JSON.stringify(rest.filter((e) => e.tool).map((e) => [e.type, e.tool])))
    assert.ok(!calls.some((c) => c.url.endsWith('send_payment') && c.body?.to === 'offlist.testnet'), 'never pays a seller off the list')
    const text = finalText(rest)
    assert.match(text, /0\.0008/)
    assert.match(text, new RegExp(TX))
    noOnChainClaims(text)
    console.log('best-price reply:', text.replace(/\s+/g, ' ').slice(0, 400))
  })

  test('without best-price, a Mind does not claim to compare sellers', async () => {
    const { all } = await chat(mind('Plain', ['payments']), 'Compare the prices of every seller of the gas-price report and tell me the cheapest one.')
    assert.ok(!toolsCalled(all).some((t) => ['get_quotes', 'buy_data'].includes(t)), JSON.stringify(toolsCalled(all)))
    const text = finalText(all)
    assert.ok(!/0\.0008|seller-b|cheapest seller is/i.test(text), text)
    console.log('not-equipped reply:', text.replace(/\s+/g, ' ').slice(0, 300))
  })

  test('price-watch (#179): over the limit, nothing is bought and no approval is asked', async () => {
    const { all, ask } = await chat(mind('Watcher', ['price-watch']), 'Buy the gas-price report only if it costs 0.0005 NEAR or less.')
    assert.ok(toolsCalled(all).includes('get_quotes'), JSON.stringify(toolsCalled(all)))
    assert.equal(ask, undefined, 'no payment card over the limit')
    assert.ok(!toolsCalled(all).includes('send_payment'))
    const text = finalText(all)
    assert.match(text, /0\.0008/)
    console.log('price-watch over reply:', text.replace(/\s+/g, ' ').slice(0, 300))
  })

  test('price-watch (#179): under the limit, it asks to buy the cheapest payable seller; a decline moves nothing', async () => {
    const before = calls.filter((c) => c.url.endsWith('send_payment')).length
    const { ask, rest } = await chat(mind('Watcher', ['price-watch']), 'Buy the gas-price report only if it costs 0.001 NEAR or less.', { approve: false })
    assert.equal(ask?.tool, 'send_payment')
    assert.deepEqual(ask.args, { to: 'seller-b.testnet', amountNear: '0.0008' })
    assert.equal(calls.filter((c) => c.url.endsWith('send_payment')).length, before, 'declined: nothing reached the wallet')
    noOnChainClaims(finalText(rest))
  })

  test('invoice (#180): the invoice names this Mind\'s own wallet and waits for approval before it is emailed', async () => {
    const before = calls.filter((c) => c.url.endsWith('/mail/send')).length
    const { all, ask } = await chat(mind('Biller', ['invoice']), 'Send an invoice to client@example.com for 0.05 NEAR for the logo design.', { mail: true })
    assert.ok(toolsCalled(all).includes('get_balance'), JSON.stringify(toolsCalled(all)))
    assert.equal(ask?.tool, 'mail_send')
    assert.deepEqual(ask.args.to, ['client@example.com'])
    assert.ok(ask.args.text.includes(MIND_WALLET), ask.args.text)
    assert.match(ask.args.text, /0\.05/)
    assert.equal(calls.filter((c) => c.url.endsWith('/mail/send')).length, before, 'nothing emailed before approval')
    console.log('invoice text:', ask.args.text.replace(/\s+/g, ' ').slice(0, 400))
  })

  test('invoice (#180): "paid" only when the transaction shows it reached this wallet', async () => {
    const m = mind('Biller', ['invoice'])
    const good = await chat(m, `Was my 0.05 NEAR invoice paid? The client says client.testnet paid it in transaction ${GOOD_PAYMENT}.`, { mail: true })
    assert.ok(toolsCalled(good.all).includes('near_check_transfer'), JSON.stringify(toolsCalled(good.all)))
    const check = good.all.find((e) => e.type === 'tool.result' && e.tool === 'near_check_transfer')?.result
    assert.deepEqual([check?.toThisMindsWallet, check?.coversAmount], [true, true], JSON.stringify(check))
    assert.match(finalText(good.all), /paid/i)
    assert.ok(!/not paid|was not paid|wasn't paid|isn't paid|different account|not (to )?(me|you|my|your|this)/i.test(finalText(good.all)), finalText(good.all))
    console.log('invoice paid reply:', finalText(good.all).replace(/\s+/g, ' ').slice(0, 300))

    const wrong = await chat(m, `Was my 0.05 NEAR invoice paid? The client says client.testnet paid it in transaction ${ELSEWHERE_PAYMENT}.`, { mail: true })
    assert.ok(toolsCalled(wrong.all).includes('near_check_transfer'), JSON.stringify(toolsCalled(wrong.all)))
    const text = finalText(wrong.all)
    assert.match(text, /someone-else\.testnet|another account|not (to )?(this|your)|does not match|doesn't match|not paid|wasn't|was not|isn't|is not/i, text)
    assert.ok(!toolsCalled(wrong.all).includes('send_payment'))
    console.log('invoice wrong-receiver reply:', text.replace(/\s+/g, ' ').slice(0, 300))
  })

  test('mind-seller (#181): selling waits for approval, then tells the owner what buyers need', async () => {
    const { ask, rest } = await chat(mind('Seller', ['mind-seller']), 'Sell this to other Minds as weekly-digest for 0.002 NEAR, title "Weekly gas digest": "Gas stayed at 0.1 Ggas all week."', { approve: true })
    assert.equal(ask?.tool, 'sell_offer')
    assert.deepEqual([ask.args.item, ask.args.priceNear], ['weekly-digest', '0.002'])
    const put = rest.find((e) => e.type === 'tool.result' && e.tool === 'sell_offer')
    assert.equal(put?.result?.sellerMindId, SELLER_MIND)
    const text = finalText(rest)
    assert.match(text, new RegExp(SELLER_MIND))
    console.log('mind-seller sell reply:', text.replace(/\s+/g, ' ').slice(0, 300))
  })

  test('mind-seller (#181): buying from another Mind pays that Mind\'s wallet after approval and returns the content', async () => {
    const { ask, rest } = await chat(mind('Buyer', ['mind-seller']), `Buy weekly-digest from the Mind ${SELLER_MIND}.`, { approve: true })
    assert.equal(ask?.tool, 'send_payment')
    assert.deepEqual(ask.args, { to: SELLER_WALLET, amountNear: '0.002' })
    assert.ok(rest.some((e) => e.type === 'tool.result' && e.tool === 'buy_from_mind' && e.result?.status === 'paid'), JSON.stringify(rest.filter((e) => e.tool).map((e) => [e.type, e.tool])))
    const text = finalText(rest)
    assert.match(text, /0\.000045|0\.1 Ggas/)
    noOnChainClaims(text)
    console.log('mind-seller buy reply:', text.replace(/\s+/g, ' ').slice(0, 300))
  })
})
