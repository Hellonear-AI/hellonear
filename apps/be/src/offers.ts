// Mind as Seller (#181): a Mind sells something it made (a report, a digest) to other Minds, paid to its own wallet.
// Same 402 pattern as the shop (#150): the buyer asks and gets the price and the seller Mind's wallet address, pays it
// with send_payment (its owner approves, its wallet policy checks it), and asks again with the tx hash. A hash is
// accepted once, only if the buyer's own payment row says it sent at least the price to that address in the last hour,
// and NEAR RPC shows that transfer succeeded from the buyer's wallet. The buyer's wallet must list the seller's address,
// or OutLayer refuses the payment before signing. Testnet NEAR, not the x402 standard.
import { z } from 'zod'
import { query } from './db.ts'
import { HttpError } from './http.ts'
import { rpc, txHashSchema } from './shop.ts'
import { isDemoMind, keyOf, toNear, toYocto } from './wallets.ts'

export const offerItemSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'lowercase letters, digits and hyphens, e.g. "weekly-digest"')
export const putOfferSchema = z.object({
  title: z.string().trim().min(1).max(200),
  priceNear: z.string().regex(/^\d{1,3}(\.\d{1,24})?$/, 'NEAR as a decimal string, e.g. "0.01"').refine((v) => toYocto(v) > 0n && toYocto(v) <= 10n ** 24n, 'more than 0, at most 1 NEAR'),
  content: z.string().min(1).max(20_000),
}).strict()
export { txHashSchema }

// A seller is paid into its own wallet. The shared demo wallet (try-out and playground Minds) is everyone's, so a
// try-out Mind can neither sell nor be bought from.
async function sellerWallet(mindId: string) {
  if (await isDemoMind(mindId)) throw new HttpError(403, 'demo_not_allowed', { action: 'sell' })
  const w = await keyOf(mindId)
  if (w.shared) throw new HttpError(403, 'demo_not_allowed', { action: 'sell' })
  return w.address
}

// The selling Mind publishes (or replaces) one offer, with its own run's wallet token.
export async function putOffer(mindId: string, item: string, body: z.infer<typeof putOfferSchema>) {
  const payTo = await sellerWallet(mindId)
  await query(
    `insert into mind_offers (mind_id, item, title, price_yocto, content) values ($1, $2, $3, $4, $5)
     on conflict (mind_id, item) do update set title = excluded.title, price_yocto = excluded.price_yocto, content = excluded.content, updated_at = now()`,
    [mindId, item, body.title, toYocto(body.priceNear).toString(), body.content])
  return { sellerMindId: mindId, item, title: body.title, priceNear: toNear(toYocto(body.priceNear)), payTo }
}

export type OfferAnswer =
  | { status: 'payment_required'; sellerMindId: string; item: string; title: string; priceNear: string; payTo: string }
  | { status: 'paid'; sellerMindId: string; item: string; title: string; content: string; receipt: { txHash: string; paymentId: string; amountNear: string; payTo: string } }

export async function buyOffer(buyerMindId: string, sellerMindId: string, item: string, txHash?: string): Promise<{ httpStatus: 200 | 402; body: OfferAnswer }> {
  // An unknown Mind, a Mind with nothing under that name, and a try-out seller all look the same to the buyer.
  const [o] = await query<{ title: string; price_yocto: string; content: string }>('select title, price_yocto, content from mind_offers where mind_id = $1 and item = $2', [sellerMindId, item])
  if (!o || (await isDemoMind(sellerMindId))) throw new HttpError(404, 'no_offer')
  if (sellerMindId === buyerMindId) throw new HttpError(400, 'own_offer')
  const payTo = await sellerWallet(sellerMindId)
  const price = BigInt(o.price_yocto)
  const offer = { sellerMindId, item, title: o.title, priceNear: toNear(price), payTo }
  if (!txHash) return { httpStatus: 402, body: { status: 'payment_required', ...offer } }

  const [used] = await query('select 1 from offer_purchases where tx_hash = $1', [txHash])
  if (used) throw new HttpError(409, 'payment_already_used')
  // Our own record first: the buyer's wallet sent it, to the seller's wallet, enough, recently.
  const [pay] = await query<{ id: string; to_account: string; amount_yocto: string }>(
    `select id, to_account, amount_yocto from wallet_payments where mind_id = $1 and tx_hash = $2 and status = 'sent' and created_at > now() - interval '1 hour'`, [buyerMindId, txHash])
  if (!pay) throw new HttpError(402, 'payment_not_found', offer)
  if (pay.to_account !== payTo || BigInt(pay.amount_yocto) < price) throw new HttpError(402, 'payment_does_not_match', offer)
  // Then the chain: the transfer succeeded, signed by the buyer's wallet, received by the seller's, for at least the price.
  const { address } = await keyOf(buyerMindId)
  const tx = (await rpc('tx', { tx_hash: txHash, sender_account_id: address, wait_until: 'FINAL' })).result
  const deposit = (tx?.transaction?.actions ?? []).reduce((sum: bigint, a: any) => sum + BigInt(a?.Transfer?.deposit ?? 0), 0n)
  const ok = tx?.status && 'SuccessValue' in tx.status && tx.transaction?.signer_id === address && tx.transaction?.receiver_id === payTo && deposit >= price
  if (!ok) throw new HttpError(402, 'payment_not_on_chain', offer)

  const inserted = await query('insert into offer_purchases (tx_hash, buyer_mind_id, seller_mind_id, item, payment_id) values ($1, $2, $3, $4, $5) on conflict do nothing returning tx_hash',
    [txHash, buyerMindId, sellerMindId, item, pay.id])
  if (!inserted.length) throw new HttpError(409, 'payment_already_used')
  return { httpStatus: 200, body: { status: 'paid', sellerMindId, item, title: o.title, content: o.content, receipt: { txHash, paymentId: pay.id, amountNear: toNear(BigInt(pay.amount_yocto)), payTo } } }
}
