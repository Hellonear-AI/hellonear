// A Mind's OutLayer wallet (#14, #15): create it, read it, and build the owner's transactions.
// The backend holds the agent key (`wk_…`, encrypted) and never returns it or the handoff_url. Owner actions
// (policy, freeze, unfreeze) are calls on the OutLayer contract that the owner signs in the FE with NEAR Connect;
// the backend only prepares them (apps/be/spikes/01-outlayer/README.md, "Owner actions on-chain").
import { z } from 'zod'
import { config } from './config.ts'
import { decrypt, encrypt, sha256 } from './crypto.ts'
import { query } from './db.ts'
import { HttpError, UPSTREAM_ERROR, fetchFailure } from './http.ts'

const YOCTO = 10n ** 24n
const accountIdSchema = z.string().toLowerCase().regex(/^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/, 'a NEAR account id')
const nearAmountSchema = z.string().regex(/^\d{1,3}(\.\d{1,24})?$/, 'NEAR as a decimal string, e.g. "0.05"')

// Policy v2 (decided 4 Nov): OutLayer is the hard stop, approval lives in the app.
// The daily cap (#149) is OutLayer's `rules.limits.daily`, checked in the TEE as `spent today + amount > cap` (proven on
// testnet 10 Nov: a payment that lands exactly on the cap goes through, a refused one does not count). Optional: null
// or left out = no daily cap. It may not be below the per-payment limit, which would make that limit meaningless.
export const policySchema = z.object({
  perTransactionNear: nearAmountSchema.refine((v) => toYocto(v) > 0n && toYocto(v) <= 10n * YOCTO, 'between 0 and 10 NEAR'),
  dailyNear: nearAmountSchema.refine((v) => toYocto(v) > 0n && toYocto(v) <= 100n * YOCTO, 'between 0 and 100 NEAR').nullish(),
  whitelist: z.array(accountIdSchema).min(1).max(20),
}).refine((b) => !b.dailyNear || toYocto(b.dailyNear) >= toYocto(b.perTransactionNear), { path: ['dailyNear'], message: 'not below perTransactionNear' })

export function toYocto(near: string): bigint {
  const [whole, frac = ''] = near.split('.')
  return BigInt(whole) * YOCTO + BigInt((frac + '0'.repeat(24)).slice(0, 24))
}
export function toNear(yocto: string | bigint): string {
  const v = BigInt(yocto)
  const frac = (v % YOCTO).toString().padStart(24, '0').replace(/0+$/, '')
  return frac ? `${v / YOCTO}.${frac}` : `${v / YOCTO}`
}

// OutLayer's answer as is (status + JSON), for callers that handle refusals themselves (payments).
export async function outlayerRaw(method: string, path: string, key: string, body?: unknown): Promise<{ status: number; body: any }> {
  let res: Response
  try {
    res = await fetch(config.outlayerUrl + path, {
      method,
      headers: { authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    throw new HttpError(UPSTREAM_ERROR, 'outlayer_unreachable', { reason: fetchFailure(e) })
  }
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function outlayer(method: string, path: string, key?: string, body?: unknown): Promise<any> {
  let res: Response
  try {
    res = await fetch(config.outlayerUrl + path, {
      method,
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    throw new HttpError(UPSTREAM_ERROR, 'outlayer_unreachable', { reason: fetchFailure(e) })
  }
  if (!res.ok) throw new HttpError(UPSTREAM_ERROR, 'outlayer_error', { outlayerStatus: res.status })
  return res.json()
}

async function view(method: string, args: unknown): Promise<any> {
  const res = await fetch(config.nearRpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: config.outlayerContractId, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') } }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => { throw new HttpError(UPSTREAM_ERROR, 'rpc_unreachable', { reason: fetchFailure(e) }) })
  const body: any = await res.json().catch(() => null)
  if (!body?.result?.result) throw new HttpError(UPSTREAM_ERROR, 'rpc_error')
  return JSON.parse(Buffer.from(body.result.result).toString('utf8'))
}

type Row = { mind_id: string; wallet_id: string; near_account_id: string; key_ciphertext: string }

async function row(mindId: string): Promise<Row | null> {
  const [r] = await query<Row>('select mind_id, wallet_id, near_account_id, key_ciphertext from mind_wallets where mind_id = $1', [mindId])
  return r ?? null
}
// Judge try-out mode (#43): every demo user's Mind pays from one shared demo wallet (DEMO_OUTLAYER_API_KEY).
let demoWallet: { walletId: string; address: string } | undefined
// A try-out user's Mind, or an Attack Playground Mind (#129): it pays from the shared demo wallet, never its own.
export async function isDemoMind(mindId: string): Promise<boolean> {
  const [r] = await query<{ demo: boolean }>(
    'select u.is_demo or m.playground_attack is not null as demo from minds m join users u on u.id = m.user_id where m.id = $1', [mindId])
  return r?.demo === true
}

export async function hasWallet(mindId: string): Promise<boolean> {
  if (await isDemoMind(mindId)) return config.demoWalletKey !== ''
  return (await row(mindId)) !== null
}

export type WalletKey = { walletId: string; address: string; key: string; shared: boolean }
export async function keyOf(mindId: string): Promise<WalletKey> {
  if (await isDemoMind(mindId)) {
    if (!config.demoWalletKey) throw new HttpError(404, 'no_wallet')
    demoWallet ??= await outlayer('GET', '/wallet/v1/address?chain=near', config.demoWalletKey).then((a) => ({ walletId: a.wallet_id, address: a.address }))
    return { ...demoWallet!, key: config.demoWalletKey, shared: true }
  }
  const r = await row(mindId)
  if (!r) throw new HttpError(404, 'no_wallet')
  return { walletId: r.wallet_id, address: r.near_account_id, key: decrypt(config.secretsMasterKey, r.key_ciphertext, `wallet:${mindId}`), shared: false }
}

// A transaction for NEAR Connect's signAndSendTransaction, signed by the owner.
export type OwnerTransaction = { receiverId: string; actions: { type: 'FunctionCall'; params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string } }[] }
const call = (methodName: string, args: Record<string, unknown>, gas: string, deposit = '0'): OwnerTransaction =>
  ({ receiverId: config.outlayerContractId, actions: [{ type: 'FunctionCall', params: { methodName, args, gas, deposit } }] })

export async function createWallet(mindId: string) {
  if (await row(mindId)) throw new HttpError(409, 'wallet_exists')
  const reg = await outlayer('POST', '/register')
  if (typeof reg?.api_key !== 'string' || !/^[0-9a-f]{64}$/.test(reg.near_account_id ?? '')) throw new HttpError(UPSTREAM_ERROR, 'outlayer_error')
  const inserted = await query(
    `insert into mind_wallets (mind_id, wallet_id, near_account_id, key_ciphertext) values ($1, $2, $3, $4)
     on conflict (mind_id) do nothing returning mind_id`,
    [mindId, reg.wallet_id, reg.near_account_id, encrypt(config.secretsMasterKey, reg.api_key, `wallet:${mindId}`)],
  )
  if (!inserted.length) throw new HttpError(409, 'wallet_exists')
  return getWallet(mindId)
}

export async function getWallet(mindId: string) {
  const { address, key, shared } = await keyOf(mindId)
  const [p, b] = await Promise.all([outlayer('GET', '/wallet/v1/policy', key), outlayer('GET', '/wallet/v1/balance?chain=near', key)])
  const stored = p.policy === 'stored'
  return {
    address,
    shared,
    balanceNear: toNear(b.balance ?? '0'),
    // OutLayer's own counter for the daily cap (`usage.daily.native.spent`, testnet 10 Nov); `{}` before the first payment.
    // Whether it resets at 00:00 UTC or after a rolling 24 h is not proven yet.
    spentTodayNear: toNear(/^\d+$/.test(String(p.usage?.daily?.native?.spent)) ? p.usage.daily.native.spent : '0'),
    frozen: p.frozen === true,
    policy: stored
      ? {
          perTransactionNear: p.rules?.limits?.per_transaction?.native ? toNear(p.rules.limits.per_transaction.native) : null,
          dailyNear: p.rules?.limits?.daily?.native ? toNear(p.rules.limits.daily.native) : null,
          whitelist: p.rules?.addresses?.mode === 'whitelist' ? p.rules.addresses.list : null,
          transactionTypes: p.rules?.transaction_types ?? null,
          // false if the policy was set for another key: then OutLayer would refuse this Mind's own key.
          boundToThisWallet: Array.isArray(p.authorized_key_hashes) && p.authorized_key_hashes.includes(sha256(key)),
        }
      : null,
  }
}

// Deleting a Mind deletes its `mind_wallets` row, the only copy of the agent key: after that nobody can move what is
// left in the wallet (the owner never holds the key, #15). So a delete is refused while the Mind's own wallet holds more
// than dust, unless the owner acknowledged it (#161). Try-out and playground Minds pay from the shared demo wallet and
// have no row of their own, so they are never refused.
const DUST_YOCTO = 10n ** 21n // 0.001 NEAR
export async function assertWalletEmpty(mindId: string) {
  if (await isDemoMind(mindId)) return
  const r = await row(mindId)
  if (!r) return
  const b = await outlayer('GET', '/wallet/v1/balance?chain=near', decrypt(config.secretsMasterKey, r.key_ciphertext, `wallet:${mindId}`))
  const balance = BigInt(b.balance ?? '0')
  if (balance > DUST_YOCTO) throw new HttpError(409, 'wallet_not_empty', { balanceNear: toNear(balance) })
}

// Builds policy v2 for this wallet, has OutLayer encrypt and sign it, and returns the owner's store_wallet_policy tx.
export async function policyTransaction(mindId: string, ownerAccountId: string, body: z.infer<typeof policySchema>): Promise<OwnerTransaction> {
  const { walletId, key } = await keyOf(mindId)
  const policy = {
    wallet_id: walletId,
    rules: {
      limits: {
        per_transaction: { native: toYocto(body.perTransactionNear).toString() },
        ...(body.dailyNear ? { daily: { native: toYocto(body.dailyNear).toString() } } : {}),
      },
      addresses: { mode: 'whitelist', list: [...new Set(body.whitelist)] },
      transaction_types: ['transfer'],
    },
    capabilities: { evm_sign: { allowed: false }, solana_sign: { allowed: false } },
    authorized_key_hashes: [sha256(key)],
    approval: { threshold: { required: 1 }, excluded_types: ['transfer', 'call', 'delete', 'intents_swap', 'cross_chain_withdraw'], approvers: [{ id: ownerAccountId, role: 'admin' }] },
  }
  const enc = await outlayer('POST', '/wallet/v1/encrypt-policy', key, policy)
  const sig = await outlayer('POST', '/wallet/v1/sign-policy', key, { encrypted_data: enc.encrypted_base64, caller: ownerAccountId })
  if (typeof enc?.encrypted_base64 !== 'string' || typeof sig?.signature_hex !== 'string' || typeof sig?.public_key_hex !== 'string') throw new HttpError(UPSTREAM_ERROR, 'outlayer_error')
  // The keystore signs `store_wallet_policy:v2:…` over the version this write stores (current + 1), the new policy's
  // lock and a deadline (unix seconds); the contract rebuilds that message from the same three args, so pass them as is.
  if (!Number.isSafeInteger(sig.version) || typeof sig.locked !== 'boolean' || !Number.isSafeInteger(sig.valid_until)) throw new HttpError(UPSTREAM_ERROR, 'outlayer_error')
  const walletPubkey = `ed25519:${sig.public_key_hex}`
  const deposit = await view('estimate_wallet_policy_cost', { wallet_pubkey: walletPubkey, encrypted_data: enc.encrypted_base64 })
  if (!/^\d+$/.test(String(deposit))) throw new HttpError(UPSTREAM_ERROR, 'rpc_error')
  return call('store_wallet_policy', { wallet_pubkey: walletPubkey, encrypted_data: enc.encrypted_base64, wallet_signature: sig.signature_hex, version: sig.version, locked: sig.locked, valid_until: sig.valid_until }, '100000000000000', String(deposit))
}

export async function freezeTransaction(mindId: string, frozen: boolean): Promise<OwnerTransaction> {
  const { address } = await keyOf(mindId)
  return call(frozen ? 'freeze_wallet' : 'unfreeze_wallet', { wallet_pubkey: `ed25519:${address}` }, '30000000000000')
}
