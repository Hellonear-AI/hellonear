// A stand-in for the OutLayer wallet API and the outlayer.testnet view the backend uses (src/wallets.ts), with the
// response shapes seen on testnet (spike 01, 5 Nov). Also answers NEAR JSON-RPC at /rpc for estimate_wallet_policy_cost.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

type Wallet = { walletId: string; key: string; account: string; frozen: boolean; policy: any | null; balance: string; policyVersion: number; spent?: bigint }
export const fakeOutlayer = {
  requests: [] as { method: string; path: string; body: any; key?: string }[],
  wallets: [] as Wallet[],
  policyCost: '10690000000000000000000',
  // Transfers the fake chain saw, by tx hash, for NEAR RPC's `tx` method (#150). Shapes from a live testnet answer (10 Nov).
  txs: new Map<string, { signer: string; receiver: string; deposit: string; failed?: boolean }>(),
  // The next gas_price answer is an RPC error (#156 review: a failed read must not use up the payment).
  failGasPrice: false,
  failNext: 0,
  // A wallet created outside the backend (the shared demo wallet), funded with 1 NEAR, no policy.
  addWallet(): Wallet {
    const w: Wallet = { walletId: randomUUID(), key: `wk_${randomBytes(32).toString('hex')}`, account: randomBytes(32).toString('hex'), frozen: false, policy: null, balance: (10n ** 24n).toString(), policyVersion: 0 }
    this.wallets.push(w)
    return w
  },
  byAccount(account: string) { return this.wallets.find((w) => w.account === account)! },
  // What the owner's signed store_wallet_policy does: the policy the backend had encrypted becomes the wallet's policy.
  store(encrypted: string) {
    const p = JSON.parse(Buffer.from(encrypted, 'base64').toString('utf8'))
    const w = this.wallets.find((w) => w.walletId === p.wallet_id)!
    w.policy = p
    w.policyVersion++
  },
}

// OutLayer's usage counters (GET /wallet/v1/policy): `{}` until the wallet has spent something.
const usageOf = (w: Wallet) => w.spent ? { daily: { native: { spent: w.spent.toString() } }, hourly: { native: { spent: w.spent.toString() } } } : {}
const send = (res: ServerResponse, status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
async function json(req: IncomingMessage) {
  let s = ''
  for await (const c of req) s += c
  return s ? JSON.parse(s) : undefined
}

export const outlayerServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://outlayer')
  const body = await json(req)
  const key = String(req.headers.authorization ?? '').replace(/^Bearer /, '') || undefined
  fakeOutlayer.requests.push({ method: req.method!, path: url.pathname + url.search, body, key })
  if (fakeOutlayer.failNext > 0) { fakeOutlayer.failNext--; return send(res, 500, { error: 'internal' }) }

  if (req.method === 'POST' && url.pathname === '/rpc' && body.method === 'tx') {
    const t = fakeOutlayer.txs.get(body.params.tx_hash)
    if (!t || t.signer !== body.params.sender_account_id) return send(res, 200, { jsonrpc: '2.0', id: 1, error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_TRANSACTION' } } })
    return send(res, 200, { jsonrpc: '2.0', id: 1, result: { final_execution_status: 'FINAL', status: t.failed ? { Failure: { ActionError: {} } } : { SuccessValue: '' }, transaction: { signer_id: t.signer, receiver_id: t.receiver, actions: [{ Transfer: { deposit: t.deposit } }] } } })
  }
  if (req.method === 'POST' && url.pathname === '/rpc' && body.method === 'status') {
    return send(res, 200, { jsonrpc: '2.0', id: 1, result: { chain_id: 'testnet', protocol_version: 88, sync_info: { latest_block_height: 277049858, latest_block_time: '2026-11-10T09:36:17Z' }, validators: Array.from({ length: 20 }, (_, i) => ({ account_id: `v${i}.testnet` })) } })
  }
  if (req.method === 'POST' && url.pathname === '/rpc' && body.method === 'gas_price' && fakeOutlayer.failGasPrice) { fakeOutlayer.failGasPrice = false; return send(res, 200, { jsonrpc: '2.0', id: 1, error: { name: 'INTERNAL_ERROR' } }) }
  if (req.method === 'POST' && url.pathname === '/rpc' && body.method === 'gas_price') return send(res, 200, { jsonrpc: '2.0', id: 1, result: { gas_price: '100000000' } })
  if (req.method === 'POST' && url.pathname === '/rpc') {
    const p = body.params
    if (p.account_id !== 'outlayer.testnet' || p.method_name !== 'estimate_wallet_policy_cost') return send(res, 200, { jsonrpc: '2.0', id: 1, error: { message: 'unknown view' } })
    return send(res, 200, { jsonrpc: '2.0', id: 1, result: { result: [...Buffer.from(JSON.stringify(fakeOutlayer.policyCost))] } })
  }
  if (req.method === 'POST' && url.pathname === '/register') {
    const w: Wallet = { walletId: randomUUID(), key: `wk_${randomBytes(32).toString('hex')}`, account: randomBytes(32).toString('hex'), frozen: false, policy: null, balance: '0', policyVersion: 0 }
    fakeOutlayer.wallets.push(w)
    return send(res, 200, { wallet_id: w.walletId, api_key: w.key, near_account_id: w.account, handoff_url: `https://app.outlayer.ai/wallet?key=${w.key}`, trial: { available: true } })
  }
  const w = fakeOutlayer.wallets.find((x) => x.key === key)
  if (!w) return send(res, 401, { error: 'unauthorized' })
  if (req.method === 'GET' && url.pathname === '/wallet/v1/policy') {
    return send(res, 200, w.policy
      ? { wallet_id: w.walletId, controller: `ed25519:${w.account}`, frozen: w.frozen, policy: 'stored', rules: w.policy.rules, approval: w.policy.approval, capabilities: w.policy.capabilities, authorized_key_hashes: w.policy.authorized_key_hashes, usage: usageOf(w) }
      : { wallet_id: w.walletId, controller: `ed25519:${w.account}`, frozen: w.frozen, policy: 'none', usage: usageOf(w) })
  }
  if (req.method === 'GET' && url.pathname === '/wallet/v1/address') return send(res, 200, { wallet_id: w.walletId, chain: 'near', address: w.account, public_key: `ed25519:${w.account}` })
  if (req.method === 'GET' && url.pathname === '/wallet/v1/balance') return send(res, 200, { balance: w.balance, token: 'near', account_id: w.account, account: 'executor' })
  if (req.method === 'POST' && url.pathname === '/wallet/v1/encrypt-policy') {
    if (body.wallet_id !== w.walletId) return send(res, 400, { error: 'wallet_mismatch' })
    // Real OutLayer encrypts; the fake only encodes, so tests can read what the backend asked for.
    return send(res, 200, { encrypted_base64: Buffer.from(JSON.stringify(body)).toString('base64'), wallet_pubkey: w.walletId })
  }
  if (req.method === 'POST' && url.pathname === '/wallet/v1/sign-policy') {
    const hash = createHash('sha256').update(`${body.encrypted_data}:${body.caller}`).digest('hex')
    // Like the keystore since the v2 store message: the version this write stores, the lock and a 7-day deadline.
    return send(res, 200, { signature_hex: hash + hash, public_key_hex: w.account, version: w.policyVersion + 1, locked: false, valid_until: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 })
  }
  if (req.method === 'POST' && url.pathname === '/wallet/v1/transfer') {
    // Same order and messages as testnet (spike 01): frozen, policy, then the chain.
    if (w.frozen) return send(res, 403, { error: 'wallet_frozen', message: 'Wallet is frozen by controller' })
    const amount = BigInt(body.amount)
    const limit = w.policy?.rules?.limits?.per_transaction?.native
    if (limit && amount > BigInt(limit)) return send(res, 403, { error: 'policy_denied', message: `Per-transaction limit exceeded for native: ${amount} > ${limit}` })
    // The daily cap as on testnet (10 Nov): spent + amount > cap is refused, a refusal does not count.
    const daily = w.policy?.rules?.limits?.daily?.native
    if (daily && (w.spent ?? 0n) + amount > BigInt(daily)) return send(res, 403, { error: 'policy_denied', message: `Daily limit exceeded for native: ${w.spent ?? 0n} + ${amount} > ${daily}` })
    const list = w.policy?.rules?.addresses?.list
    if (list && !list.includes(body.to)) return send(res, 403, { error: 'policy_denied', message: `Address '${body.to}' is not in whitelist` })
    if (BigInt(w.balance) < amount) return send(res, 422, { error: 'chain_refused', message: `the account ${w.account} is not visible on the network` })
    w.balance = (BigInt(w.balance) - amount).toString()
    w.spent = (w.spent ?? 0n) + amount
    // Base58 like a real tx hash, 44 characters.
    const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    const txHash = [...randomBytes(44)].map((b) => B58[b % 58]).join('')
    fakeOutlayer.txs.set(txHash, { signer: w.account, receiver: body.to, deposit: amount.toString() })
    return send(res, 200, { request_id: randomUUID(), status: 'success', tx_hash: txHash })
  }
  send(res, 404, { error: 'not_found' })
})
