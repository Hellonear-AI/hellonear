// Wallet tokens (#42, option B): the engine gets this instead of the wallet key. It names one Mind of one user and
// expires after 15 minutes; the backend issues a new one with every chat, approve/decline and builder run.
// Format: `wt_<base64url payload>.<base64url HMAC-SHA256>`, key derived from SECRETS_MASTER_KEY (no extra env var).
import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from './config.ts'
import { HttpError } from './http.ts'

export const WALLET_TOKEN_TTL_MS = 15 * 60 * 1000
const key = () => createHmac('sha256', config.secretsMasterKey).update('hellonear wallet token v1').digest()
const mac = (payload: string) => createHmac('sha256', key()).update(payload).digest('base64url')

export function issueWalletToken(userId: string, mindId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, m: mindId, exp: now + WALLET_TOKEN_TTL_MS })).toString('base64url')
  return `wt_${payload}.${mac(payload)}`
}

export function verifyWalletToken(token: string | undefined, now = Date.now()): { userId: string; mindId: string } {
  const m = /^wt_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token ?? '')
  if (!m) throw new HttpError(401, 'invalid_wallet_token')
  const expected = Buffer.from(mac(m[1]))
  const given = Buffer.from(m[2])
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new HttpError(401, 'invalid_wallet_token')
  const p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'))
  if (typeof p.exp !== 'number' || p.exp < now) throw new HttpError(401, 'wallet_token_expired')
  return { userId: String(p.u), mindId: String(p.m) }
}
