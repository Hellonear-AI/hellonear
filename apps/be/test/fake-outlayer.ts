// A stand-in for the OutLayer wallet API and the outlayer.testnet view the backend uses (src/wallets.ts), with the
// response shapes seen on testnet (spike 01, 5 Nov). Also answers NEAR JSON-RPC at /rpc for estimate_wallet_policy_cost.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

type Wallet = { walletId: string; key: string; account: string; frozen: boolean; policy: any | null; balance: string; policyVersion: number }
export const fakeOutlayer = {
  requests: [] as { method: string; path: string; body: any; key?: string }[],
  wallets: [] as Wallet[],
  policyCost: '10690000000000000000000',
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
      ? { wallet_id: w.walletId, controller: `ed25519:${w.account}`, frozen: w.frozen, policy: 'stored', rules: w.policy.rules, approval: w.policy.approval, capabilities: w.policy.capabilities, authorized_key_hashes: w.policy.authorized_key_hashes, usage: {} }
      : { wallet_id: w.walletId, controller: `ed25519:${w.account}`, frozen: w.frozen, policy: 'none', usage: {} })
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
    const list = w.policy?.rules?.addresses?.list
    if (list && !list.includes(body.to)) return send(res, 403, { error: 'policy_denied', message: `Address '${body.to}' is not in whitelist` })
    if (BigInt(w.balance) < amount) return send(res, 422, { error: 'chain_refused', message: `the account ${w.account} is not visible on the network` })
    w.balance = (BigInt(w.balance) - amount).toString()
    return send(res, 200, { request_id: randomUUID(), status: 'success', tx_hash: randomBytes(24).toString('base64url') })
  }
  send(res, 404, { error: 'not_found' })
})
