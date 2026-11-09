// Run-scoped tokens for the engine's tools. The engine gets one of these instead of a service key. Each names one
// Mind of one user and expires after 15 minutes; the backend issues new ones with every chat, approve/decline and
// builder run.
// - Wallet tokens (#42, option B) for the payment tools: `wt_<base64url payload>.<base64url HMAC-SHA256>`.
// - Mail tokens (#96) for the email-address tools: `mt_…`, same format.
// Each kind has its own HMAC key derived from SECRETS_MASTER_KEY (no extra env var), so a wallet token is never a
// valid mail token and the other way round.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from './config.ts'
import { HttpError } from './http.ts'

export const WALLET_TOKEN_TTL_MS = 15 * 60 * 1000

function tokenKind(prefix: 'wt' | 'mt', label: string, errors: { invalid: string; expired: string }) {
  const key = () => createHmac('sha256', config.secretsMasterKey).update(label).digest()
  const mac = (payload: string) => createHmac('sha256', key()).update(payload).digest('base64url')
  const pattern = new RegExp(`^${prefix}_([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)$`)
  return {
    issue(userId: string, mindId: string, now = Date.now()): string {
      const payload = Buffer.from(JSON.stringify({ u: userId, m: mindId, exp: now + WALLET_TOKEN_TTL_MS })).toString('base64url')
      return `${prefix}_${payload}.${mac(payload)}`
    },
    verify(token: string | undefined, now = Date.now()): { userId: string; mindId: string } {
      const m = pattern.exec(token ?? '')
      if (!m) throw new HttpError(401, errors.invalid)
      const expected = Buffer.from(mac(m[1]))
      const given = Buffer.from(m[2])
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new HttpError(401, errors.invalid)
      const p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'))
      if (typeof p.exp !== 'number' || p.exp < now) throw new HttpError(401, errors.expired)
      return { userId: String(p.u), mindId: String(p.m) }
    },
  }
}

const wallet = tokenKind('wt', 'hellonear wallet token v1', { invalid: 'invalid_wallet_token', expired: 'wallet_token_expired' })
const mail = tokenKind('mt', 'hellonear mail token v1', { invalid: 'invalid_mail_token', expired: 'mail_token_expired' })

export const issueWalletToken = wallet.issue
export const verifyWalletToken = wallet.verify
export const issueMailToken = mail.issue
export const verifyMailToken = mail.verify
