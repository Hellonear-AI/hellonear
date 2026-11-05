// Payment tools' backend (#42, option B). The engine calls these internal routes with a wallet token
// (src/walletToken.ts) and the engine key; the wallet key never leaves the backend. Every attempt is stored as a
// receipt in wallet_payments, including refusals (no tx: OutLayer refuses before signing).
import { z } from 'zod'
import { newId } from './crypto.ts'
import { pool, query } from './db.ts'
import { HttpError } from './http.ts'
import { keyOf, outlayerRaw, toNear, toYocto } from './wallets.ts'

export const sendPaymentSchema = z.object({
  to: z.string().toLowerCase().regex(/^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/, 'a NEAR account id'),
  amountNear: z.string().regex(/^\d{1,3}(\.\d{1,24})?$/, 'NEAR as a decimal string, e.g. "0.01"').refine((v) => toYocto(v) > 0n, 'more than 0'),
})

export type PaymentStatus = 'pending' | 'sent' | 'policy_denied' | 'wallet_frozen' | 'failed'
export type PaymentResult = { paymentId: string; status: PaymentStatus; to: string; amountNear: string; txHash?: string; message?: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Policy v2 has OutLayer approval off, so `pending_approval` should not happen; if an owner turned it on, wait briefly.
export const pendingPoll = { intervalMs: 3000, attempts: 10 }

async function finish(id: string, status: PaymentStatus, fields: { txHash?: string; requestId?: string; message?: string }) {
  await query('update wallet_payments set status = $2, tx_hash = $3, outlayer_request_id = coalesce($4, outlayer_request_id), message = $5, updated_at = now() where id = $1',
    [id, status, fields.txHash ?? null, fields.requestId ?? null, fields.message?.slice(0, 500) ?? null])
}

// `cap` (judge try-out mode, #43): at most `max` payments per user that are sent or still pending. The check and the
// insert run in one transaction under a per-user advisory lock, so parallel payments cannot both pass the cap.
export async function sendPayment(mindId: string, body: z.infer<typeof sendPaymentSchema>, opts: { cap?: { userId: string; max: number; message: string } } = {}): Promise<PaymentResult> {
  const { key } = await keyOf(mindId)
  const id = newId('pay')
  const amount = toYocto(body.amountNear)
  const base = { paymentId: id, to: body.to, amountNear: toNear(amount) }
  let refused: string | null = null
  const client = await pool.connect()
  try {
    await client.query('begin')
    if (opts.cap) {
      await client.query('select pg_advisory_xact_lock(4100002, hashtext($1))', [opts.cap.userId])
      const { rows: [{ n }] } = await client.query(
        `select count(*)::int as n from wallet_payments p join minds m on m.id = p.mind_id where m.user_id = $1 and p.status in ('sent', 'pending')`, [opts.cap.userId])
      if (n >= opts.cap.max) refused = opts.cap.message
    }
    await client.query('insert into wallet_payments (id, mind_id, to_account, amount_yocto, status, message) values ($1, $2, $3, $4, $5, $6)',
      [id, mindId, body.to, amount.toString(), refused ? 'failed' : 'pending', refused])
    await client.query('commit')
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
  if (refused) return { ...base, status: 'failed', message: refused }

  let out: { status: number; body: any }
  try {
    out = await outlayerRaw('POST', '/wallet/v1/transfer', key, { chain: 'near', to: body.to, amount: amount.toString() })
  } catch (e) {
    await finish(id, 'failed', { message: 'wallet service unreachable' })
    throw e
  }
  const b = out.body ?? {}
  if (out.status === 200 && b.status === 'success' && typeof b.tx_hash === 'string') {
    await finish(id, 'sent', { txHash: b.tx_hash, requestId: b.request_id })
    return { ...base, status: 'sent', txHash: b.tx_hash }
  }
  if (out.status === 200 && b.status === 'pending_approval' && typeof b.request_id === 'string') {
    await finish(id, 'pending', { requestId: b.request_id })
    for (let i = 0; i < pendingPoll.attempts; i++) {
      await sleep(pendingPoll.intervalMs)
      const r = await outlayerRaw('GET', `/wallet/v1/requests/${encodeURIComponent(b.request_id)}`, key)
      const st = r.body?.status
      if (st === 'success' && r.body?.result?.tx_hash) {
        await finish(id, 'sent', { txHash: r.body.result.tx_hash })
        return { ...base, status: 'sent', txHash: r.body.result.tx_hash }
      }
      if (st === 'failed' || st === 'rejected') {
        await finish(id, 'failed', { message: 'rejected in the OutLayer dashboard' })
        return { ...base, status: 'failed', message: 'rejected in the OutLayer dashboard' }
      }
    }
    return { ...base, status: 'pending', message: 'waiting for the owner in the OutLayer dashboard' }
  }
  if (out.status === 403 && (b.error === 'policy_denied' || b.error === 'wallet_frozen')) {
    const message = String(b.message ?? b.error)
    await finish(id, b.error, { message })
    return { ...base, status: b.error, message }
  }
  const message = out.status === 422 && b.error === 'chain_refused'
    ? 'the wallet is not funded yet (its account does not exist on chain)'
    : `wallet service answered ${out.status}`
  await finish(id, 'failed', { message })
  return { ...base, status: 'failed', message }
}

export async function walletBalance(mindId: string): Promise<{ address: string; balanceNear: string }> {
  const { address, key } = await keyOf(mindId)
  const out = await outlayerRaw('GET', '/wallet/v1/balance?chain=near', key)
  if (out.status !== 200) throw new HttpError(502, 'outlayer_error', { outlayerStatus: out.status })
  return { address, balanceNear: toNear(out.body?.balance ?? '0') }
}

export async function listPayments(mindId: string, limit = 20) {
  const rows = await query('select id, to_account, amount_yocto, status, tx_hash, message, created_at from wallet_payments where mind_id = $1 order by created_at desc limit $2', [mindId, limit])
  return rows.map((p) => ({
    paymentId: p.id, to: p.to_account, amountNear: toNear(BigInt(p.amount_yocto)), status: p.status as PaymentStatus,
    ...(p.tx_hash ? { txHash: p.tx_hash } : {}), ...(p.message ? { message: p.message } : {}), at: p.created_at.toISOString(),
  }))
}
