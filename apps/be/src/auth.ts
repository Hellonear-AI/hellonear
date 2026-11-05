// NEP-413 login (#8): the backend issues a one-time nonce, the wallet signs { message, recipient, nonce },
// the backend checks the signature and that the key is a full-access key of the account, then opens a session.
import type { IncomingMessage } from 'node:http'
import { JsonRpcProvider } from 'near-api-js'
import { verifyMessage } from 'near-api-js/nep413'
import { z } from 'zod'
import { config } from './config.ts'
import { newId, randomToken, sha256 } from './crypto.ts'
import { query } from './db.ts'
import { HttpError, cookie } from './http.ts'

export const SESSION_COOKIE = 'hn_session'

// verifyMessage only needs viewAccessKey; tests swap in a fake provider.
type AccessKeyProvider = Parameters<typeof verifyMessage>[0]['provider']
let provider: AccessKeyProvider = new JsonRpcProvider({ url: config.nearRpcUrl })
export const setProvider = (p: AccessKeyProvider) => { provider = p }

export type User = { id: string; nearAccountId: string; demo?: boolean }

export async function createChallenge() {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
  await query('insert into auth_nonces (nonce, expires_at) values ($1, $2)', [nonce, new Date(Date.now() + config.nonceTtlMs)])
  // Expired challenges are useless; drop them here instead of running a job.
  await query('delete from auth_nonces where expires_at < now() - interval \'1 hour\'')
  return { message: config.authMessage, recipient: config.authRecipient, nonce }
}

export const loginSchema = z.object({
  accountId: z.string().min(2).max(64),
  publicKey: z.string().regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]+$/),
  // Wallets return the signature as base64 (NEAR Connect) or as `ed25519:<base58>`; we accept base64.
  signature: z.string().min(1),
  nonce: z.string().min(1),
})

export async function login(body: z.infer<typeof loginSchema>): Promise<{ user: User; token: string }> {
  // Consume the nonce first, atomically: a replayed or expired nonce never reaches signature checks.
  const used = await query('update auth_nonces set used_at = now() where nonce = $1 and used_at is null and expires_at > now() returning nonce', [body.nonce])
  if (!used.length) throw new HttpError(401, 'invalid_nonce')
  const nonce = Buffer.from(body.nonce, 'base64')
  const signature = Buffer.from(body.signature, 'base64')
  if (nonce.length !== 32 || signature.length !== 64) throw new HttpError(401, 'invalid_signature')
  try {
    await verifyMessage({
      signerAccountId: body.accountId,
      signerPublicKey: body.publicKey,
      signature: new Uint8Array(signature),
      payload: { message: config.authMessage, recipient: config.authRecipient, nonce: new Uint8Array(nonce) },
      provider,
    })
  } catch {
    // Wrong signature, unknown account, or a function-call key: all the same to the caller.
    throw new HttpError(401, 'invalid_signature')
  }
  const [row] = await query<{ id: string }>(
    'insert into users (id, near_account_id) values ($1, $2) on conflict (near_account_id) do update set near_account_id = excluded.near_account_id returning id',
    [newId('usr'), body.accountId],
  )
  const token = randomToken()
  await query('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [sha256(token), row.id, new Date(Date.now() + config.sessionTtlMs)])
  return { user: { id: row.id, nearAccountId: body.accountId }, token }
}

export async function sessionUser(req: IncomingMessage): Promise<User | null> {
  const token = cookie(req, SESSION_COOKIE)
  if (!token) return null
  const [row] = await query<{ id: string; near_account_id: string; is_demo: boolean }>(
    'select u.id, u.near_account_id, u.is_demo from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()',
    [sha256(token)],
  )
  return row ? { id: row.id, nearAccountId: row.near_account_id, ...(row.is_demo ? { demo: true } : {}) } : null
}

export async function requireUser(req: IncomingMessage): Promise<User> {
  const user = await sessionUser(req)
  if (!user) throw new HttpError(401, 'unauthorized')
  return user
}

export async function logout(req: IncomingMessage) {
  const token = cookie(req, SESSION_COOKIE)
  if (token) await query('delete from sessions where token_hash = $1', [sha256(token)])
}
