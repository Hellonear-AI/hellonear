// Paid data (#150): a Mind pays for an API call on its own, with the same guards as any payment. The engine's
// `buy_data` tool calls GET /internal/v1/shop/{item} with the run's wallet token. Without a payment the answer is
// HTTP 402 with the price and the account to pay; the Mind then pays with `send_payment` (owner's approval, the
// wallet policy) and asks again with the tx hash. A hash is accepted once, only if this Mind's own payment row says
// it sent at least the price to the shop account in the last hour, and NEAR RPC shows that transfer succeeded.
// The reports are read live from NEAR testnet RPC. This is a 402 pattern on testnet NEAR, not the x402 standard.
import { z } from 'zod'
import { config } from './config.ts'
import { query } from './db.ts'
import { HttpError, UPSTREAM_ERROR, fetchFailure } from './http.ts'
import { keyOf, toNear, toYocto } from './wallets.ts'

type Item = { title: string; priceNear: string; read: () => Promise<Record<string, unknown>> }

async function rpc(method: string, params: unknown): Promise<any> {
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

export type ShopAnswer =
  | { status: 'payment_required'; item: string; title: string; priceNear: string; payTo: string }
  | { status: 'paid'; item: string; title: string; data: Record<string, unknown>; receipt: { txHash: string; paymentId: string; amountNear: string } }

export async function shop(mindId: string, item: string, txHash?: string): Promise<{ httpStatus: 200 | 402; body: ShopAnswer }> {
  const it = ITEMS[item]
  if (!config.shopPayTo) throw new HttpError(503, 'shop_not_configured')
  const offer = { item, title: it.title, priceNear: it.priceNear, payTo: config.shopPayTo }
  if (!txHash) return { httpStatus: 402, body: { status: 'payment_required', ...offer } }

  const [used] = await query('select mind_id from shop_purchases where tx_hash = $1', [txHash])
  if (used) throw new HttpError(409, 'payment_already_used')
  // Our own record first: this Mind's wallet sent it, to the shop, enough, recently.
  const [pay] = await query<{ id: string; to_account: string; amount_yocto: string }>(
    `select id, to_account, amount_yocto from wallet_payments where mind_id = $1 and tx_hash = $2 and status = 'sent' and created_at > now() - interval '1 hour'`, [mindId, txHash])
  if (!pay) throw new HttpError(402, 'payment_not_found', offer)
  if (pay.to_account !== config.shopPayTo || BigInt(pay.amount_yocto) < toYocto(it.priceNear)) throw new HttpError(402, 'payment_does_not_match', offer)
  // Then the chain: the transfer succeeded, from this wallet, to the shop, for at least the price.
  const { address } = await keyOf(mindId)
  const tx = (await rpc('tx', { tx_hash: txHash, sender_account_id: address, wait_until: 'FINAL' })).result
  const deposit = (tx?.transaction?.actions ?? []).reduce((sum: bigint, a: any) => sum + BigInt(a?.Transfer?.deposit ?? 0), 0n)
  const ok = tx?.status && 'SuccessValue' in tx.status && tx.transaction?.signer_id === address && tx.transaction?.receiver_id === config.shopPayTo && deposit >= toYocto(it.priceNear)
  if (!ok) throw new HttpError(402, 'payment_not_on_chain', offer)

  // Read before redeeming: if RPC fails here, the hash is still unused and the Mind can ask again (Lin1er, #156).
  const data = await it.read()
  const inserted = await query('insert into shop_purchases (tx_hash, mind_id, item, payment_id) values ($1, $2, $3, $4) on conflict do nothing returning tx_hash', [txHash, mindId, item, pay.id])
  if (!inserted.length) throw new HttpError(409, 'payment_already_used')
  return { httpStatus: 200, body: { status: 'paid', item, title: it.title, data, receipt: { txHash, paymentId: pay.id, amountNear: toNear(BigInt(pay.amount_yocto)) } } }
}
