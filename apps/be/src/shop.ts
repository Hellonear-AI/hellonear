// Paid data (#150): a Mind pays for an API call on its own, with the same guards as any payment. The engine's
// `buy_data` tool calls GET /internal/v1/shop/{item} with the run's wallet token. Without a payment the answer is
// HTTP 402 with the price and the account to pay; the Mind then pays with `send_payment` (owner's approval, the
// wallet policy) and asks again with the tx hash. A hash is accepted once, only if this Mind's own payment row says
// it sent at least the price to the shop account in the last hour, and NEAR RPC shows that transfer succeeded.
// The reports are read live from NEAR testnet RPC. This is a 402 pattern on testnet NEAR, not the x402 standard.
// Best Price Buyer (#176): the same items can have several sellers (SHOP_SELLERS) at different prices. `?quotes=1` lists
// them cheapest first without paying, `?seller=` picks one, and a payment counts for the seller it was sent to.
import { z } from 'zod'
import { config } from './config.ts'
import { query } from './db.ts'
import { HttpError, UPSTREAM_ERROR, fetchFailure } from './http.ts'
import { addressRuleOf, allowsAddress, keyOf, toNear, toYocto } from './wallets.ts'

type Item = { title: string; priceNear: string; read: () => Promise<Record<string, unknown>> }

export async function rpc(method: string, params: unknown): Promise<any> {
  const res = await fetch(config.nearRpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'shop', method, params }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => { throw new HttpError(UPSTREAM_ERROR, 'rpc_unreachable', { reason: fetchFailure(e) }) })
  return (await res.json().catch(() => null)) ?? {}
}

export const ITEMS: Record<string, Item> = {
  'network-status': {
    title: 'NEAR testnet status: latest block, protocol version, validator count',
    priceNear: '0.001',
    read: async () => {
      const r = (await rpc('status', [])).result
      if (!r) throw new HttpError(UPSTREAM_ERROR, 'rpc_error')
      return { chainId: r.chain_id, latestBlock: r.sync_info?.latest_block_height, at: r.sync_info?.latest_block_time, protocolVersion: r.protocol_version, validators: r.validators?.length ?? null }
    },
  },
  'gas-price': {
    title: 'NEAR testnet gas price now, and the cost of a simple transfer',
    priceNear: '0.001',
    read: async () => {
      const r = (await rpc('gas_price', [null])).result
      if (!r?.gas_price) throw new HttpError(UPSTREAM_ERROR, 'rpc_error')
      // A plain transfer burns about 0.45 Tgas: the demo wallet's transfer 7dapuFzu… (10 Nov) cost 0.0000446 NEAR at 0.1 Ggas price.
      const perGas = BigInt(r.gas_price)
      return { gasPriceYocto: r.gas_price, transferCostNear: toNear(perGas * 450_000_000_000n) }
    },
  },
}
export const itemSchema = z.enum(Object.keys(ITEMS) as [string, ...string[]])
export const txHashSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/, 'a NEAR transaction hash')
export const sellerSchema = z.string().regex(/^s\d{1,2}$/, 'a seller id such as "s1"')

// A seller's id is its place in SHOP_SELLERS (`s1`, `s2`, …), so it stays the same while the list does.
export type Seller = { id: string; account: string; multiplierMilli: bigint }
const ACCOUNT_ID = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
export function parseSellers(spec: string, fallback: string): Seller[] {
  if (!spec) return fallback ? [{ id: 's1', account: fallback, multiplierMilli: 1000n }] : []
  const sellers = spec.split(',').map((part, i) => {
    const m = part.trim().match(/^([^:\s]+):(\d{1,2})(?:\.(\d{1,3}))?$/)
    const milli = m ? BigInt(m[2]) * 1000n + BigInt((m[3] ?? '').padEnd(3, '0')) : 0n
    if (!m || !ACCOUNT_ID.test(m[1]) || milli === 0n) throw new Error(`SHOP_SELLERS: "${part.trim()}" is not account:multiplier (e.g. a.testnet:0.8)`)
    return { id: `s${i + 1}`, account: m[1], multiplierMilli: milli }
  })
  if (new Set(sellers.map((x) => x.account)).size !== sellers.length) throw new Error('SHOP_SELLERS: an account is listed twice')
  return sellers
}
// A bad SHOP_SELLERS stops the backend at start, not at the first purchase.
parseSellers(config.shopSellers, config.shopPayTo)

const priceOf = (it: Item, s: Seller) => toYocto(it.priceNear) * s.multiplierMilli / 1000n
const offerOf = (item: string, it: Item, s: Seller) => ({ item, title: it.title, seller: s.id, priceNear: toNear(priceOf(it, s)), payTo: s.account })
type Offer = ReturnType<typeof offerOf>

export type ShopAnswer =
  | ({ status: 'payment_required' } & Offer)
  | { status: 'quotes'; item: string; title: string; quotes: { seller: string; payTo: string; priceNear: string; onYourList: boolean }[] }
  | { status: 'paid'; item: string; title: string; seller: string; data: Record<string, unknown>; receipt: { txHash: string; paymentId: string; amountNear: string; payTo: string } }

export async function shop(mindId: string, item: string, opts: { txHash?: string; seller?: string; quotes?: boolean } = {}): Promise<{ httpStatus: 200 | 402; body: ShopAnswer }> {
  const it = ITEMS[item]
  // Cheapest first; a tie keeps the SHOP_SELLERS order.
  const sellers = parseSellers(config.shopSellers, config.shopPayTo).sort((a, b) => { const d = priceOf(it, a) - priceOf(it, b); return d < 0n ? -1 : d > 0n ? 1 : 0 })
  if (!sellers.length) throw new HttpError(503, 'shop_not_configured')
  if (opts.quotes) {
    // Read from the paying wallet's own policy, so the Mind only picks a seller OutLayer would let it pay.
    const rule = await addressRuleOf(mindId)
    const quotes = sellers.map((s) => ({ seller: s.id, payTo: s.account, priceNear: toNear(priceOf(it, s)), onYourList: allowsAddress(rule, s.account) }))
    return { httpStatus: 200, body: { status: 'quotes', item, title: it.title, quotes } }
  }
  const asked = opts.seller === undefined ? undefined : sellers.find((s) => s.id === opts.seller)
  if (opts.seller !== undefined && !asked) throw new HttpError(404, 'unknown_seller')
  const offer = offerOf(item, it, asked ?? sellers[0])
  if (!opts.txHash) return { httpStatus: 402, body: { status: 'payment_required', ...offer } }
  const txHash = opts.txHash

  const [used] = await query('select mind_id from shop_purchases where tx_hash = $1', [txHash])
  if (used) throw new HttpError(409, 'payment_already_used')
  // Our own record first: this Mind's wallet sent it, to one of the sellers (the one asked for, if any), enough, recently.
  const [pay] = await query<{ id: string; to_account: string; amount_yocto: string }>(
    `select id, to_account, amount_yocto from wallet_payments where mind_id = $1 and tx_hash = $2 and status = 'sent' and created_at > now() - interval '1 hour'`, [mindId, txHash])
  if (!pay) throw new HttpError(402, 'payment_not_found', offer)
  const seller = sellers.find((s) => s.account === pay.to_account)
  if (!seller || (asked && seller !== asked) || BigInt(pay.amount_yocto) < priceOf(it, seller)) throw new HttpError(402, 'payment_does_not_match', offer)
  // Then the chain: the transfer succeeded, from this wallet, to that seller, for at least its price.
  const { address } = await keyOf(mindId)
  const tx = (await rpc('tx', { tx_hash: txHash, sender_account_id: address, wait_until: 'FINAL' })).result
  const deposit = (tx?.transaction?.actions ?? []).reduce((sum: bigint, a: any) => sum + BigInt(a?.Transfer?.deposit ?? 0), 0n)
  const ok = tx?.status && 'SuccessValue' in tx.status && tx.transaction?.signer_id === address && tx.transaction?.receiver_id === seller.account && deposit >= priceOf(it, seller)
  if (!ok) throw new HttpError(402, 'payment_not_on_chain', offer)

  // Read before redeeming: if RPC fails here, the hash is still unused and the Mind can ask again (Lin1er, #156).
  const data = await it.read()
  const inserted = await query('insert into shop_purchases (tx_hash, mind_id, item, payment_id) values ($1, $2, $3, $4) on conflict do nothing returning tx_hash', [txHash, mindId, item, pay.id])
  if (!inserted.length) throw new HttpError(409, 'payment_already_used')
  return { httpStatus: 200, body: { status: 'paid', item, title: it.title, seller: seller.id, data, receipt: { txHash, paymentId: pay.id, amountNear: toNear(BigInt(pay.amount_yocto)), payTo: seller.account } } }
}
