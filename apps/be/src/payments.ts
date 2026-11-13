// Payment tools' backend (#42, option B). The engine calls these internal routes with a wallet token
// (src/walletToken.ts) and the engine key; the wallet key never leaves the backend. Every attempt is stored as a
// receipt in wallet_payments, including refusals (no tx: OutLayer refuses before signing).
import { z } from 'zod'
import { newId } from './crypto.ts'
import { pool, query } from './db.ts'
import { HttpError, UPSTREAM_ERROR } from './http.ts'
import { keyOf, outlayerRaw, toNear, toYocto } from './wallets.ts'
import { xlsx } from './xlsx.ts'

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

// `cap` (judge try-out mode, #43; Attack Playground, #129): at most `max` payments per user from the shared demo
// wallet that are sent or still pending. The check and the
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
        // Only payments from the shared demo wallet count: a try-out user's Minds, or playground Minds (#129), so an
        // owner's payments from their own wallet do not use up the playground's allowance.
        `select count(*)::int as n from wallet_payments p join minds m on m.id = p.mind_id join users u on u.id = m.user_id
          where m.user_id = $1 and p.status in ('sent', 'pending') and (u.is_demo or m.playground_attack is not null)`, [opts.cap.userId])
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
  if (out.status !== 200) throw new HttpError(UPSTREAM_ERROR, 'outlayer_error', { outlayerStatus: out.status })
  return { address, balanceNear: toNear(out.body?.balance ?? '0') }
}

export async function listPayments(mindId: string, limit = 20) {
  const rows = await query('select id, to_account, amount_yocto, status, tx_hash, message, created_at from wallet_payments where mind_id = $1 order by created_at desc limit $2', [mindId, limit])
  return rows.map((p) => ({
    paymentId: p.id, to: p.to_account, amountNear: toNear(BigInt(p.amount_yocto)), status: p.status as PaymentStatus,
    ...(p.tx_hash ? { txHash: p.tx_hash } : {}), ...(p.message ? { message: p.message } : {}), at: p.created_at.toISOString(),
  }))
}

// CSV of a Mind's payments for an accountant (realworld track): one row per attempt, newest first, in words that need
// no explaining. "Approved by" comes from the run that made the payment: a `tool.called` with `approvedBy: "rule"` is the
// owner's auto-approve rule (#167), a `tool.approval_required` for the same call is the owner's own approval.
const CSV_STATUS: Record<PaymentStatus, string> = {
  sent: 'sent', pending: 'pending', policy_denied: 'refused by the wallet policy (no money moved)',
  wallet_frozen: 'refused, wallet frozen (no money moved)', failed: 'failed (no money moved)',
}
export const CSV_HEADER = ['Date (UTC)', 'Status', 'Direction', 'Amount (NEAR)', 'Counterparty', 'Purpose', 'Approved by', 'Transaction hash', 'Explorer link', 'Note']
// RFC 4180 quoting, and a leading ' on a cell that a spreadsheet would read as a formula.
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
export interface PaymentRow { at: Date; status: string; direction: 'out'; amountNear: string; counterparty: string; purpose: string; approvedBy: string; txHash: string; explorer: string; note: string }
// The rows behind both downloads (CSV and Excel), newest first.
export async function paymentRows(mindId: string, limit = 10_000): Promise<PaymentRow[]> {
  // One pass: the payment calls in this Mind's runs, then who approved each, then the rows (no per-row subqueries).
  const rows = await query<{ id: string; created_at: Date; status: PaymentStatus; amount_yocto: string; to_account: string; tx_hash: string | null; message: string | null; shop_item: string | null; offer_item: string | null; approved_by: string | null }>(
    `with calls as (
       select e.payload->'result'->>'paymentId' as payment_id, e.run_id, e.payload->>'toolCallId' as call
       from run_events e join runs r on r.id = e.run_id
       where r.mind_id = $1 and e.type in ('tool.result', 'tool.error') and e.payload->'result' ? 'paymentId'
     ), approvals as (
       select c.payment_id,
         bool_or(a.type = 'tool.called' and a.payload->>'approvedBy' = 'rule') as by_rule,
         bool_or(a.type = 'tool.approval_required') as by_owner
       from calls c join run_events a on a.run_id = c.run_id and a.type in ('tool.called', 'tool.approval_required') and a.payload->>'toolCallId' = c.call
       group by c.payment_id
     )
     select p.id, p.created_at, p.status, p.amount_yocto, p.to_account, p.tx_hash, p.message, s.item as shop_item, o.item as offer_item,
       case when ap.by_rule then 'your rule' when ap.by_owner then 'owner' end as approved_by
     from wallet_payments p
     left join approvals ap on ap.payment_id = p.id
     left join (select distinct on (payment_id) payment_id, item from shop_purchases where mind_id = $1) s on s.payment_id = p.id
     left join (select distinct on (payment_id) payment_id, item from offer_purchases where buyer_mind_id = $1) o on o.payment_id = p.id
     where p.mind_id = $1 order by p.created_at desc limit $2`, [mindId, limit])
  return rows.map((p) => ({
    at: p.created_at,
    status: CSV_STATUS[p.status] ?? p.status,
    direction: 'out' as const,
    amountNear: toNear(BigInt(p.amount_yocto)),
    counterparty: p.to_account,
    purpose: p.shop_item ? `data report: ${p.shop_item}` : p.offer_item ? `bought from another Mind: ${p.offer_item}` : '',
    approvedBy: p.approved_by ?? '',
    txHash: p.tx_hash ?? '',
    explorer: p.tx_hash ? `https://testnet.nearblocks.io/txns/${encodeURIComponent(p.tx_hash)}` : '',
    note: p.message ?? '',
  }))
}

export async function paymentsCsv(mindId: string, limit = 10_000): Promise<string> {
  const lines = [CSV_HEADER, ...(await paymentRows(mindId, limit)).map((p) => [
    p.at.toISOString().replace('T', ' ').slice(0, 19), p.status, p.direction, p.amountNear, p.counterparty, p.purpose, p.approvedBy, p.txHash, p.explorer, p.note,
  ])]
  // A BOM so Excel opens it as UTF-8; CRLF line ends per RFC 4180.
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

// The same rows as an Excel workbook (#298): typed cells, so the columns, the amounts and the dates come out right in
// any locale, which a CSV can't do (Excel on a comma-decimal locale splits on `;`). An amount that a JS number can't
// hold exactly (more than ~15 significant digits) stays text rather than being rounded.
export async function paymentsXlsx(mindId: string, limit = 10_000): Promise<Buffer> {
  const amount = (s: string) => (String(Number(s)) === s ? Number(s) : s)
  return xlsx({
    name: 'Payments',
    header: CSV_HEADER,
    widths: [20, 30, 10, 14, 28, 34, 12, 48, 60, 40],
    rows: (await paymentRows(mindId, limit)).map((p) => [
      p.at, p.status, p.direction, amount(p.amountNear), p.counterparty, p.purpose, p.approvedBy, p.txHash,
      p.explorer ? { text: p.explorer, link: p.explorer } : '', p.note,
    ]),
  })
}
