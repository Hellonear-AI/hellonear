// Judge try-out mode (#43): `POST /v1/auth/demo` opens a session for a fresh demo user, so judges can try HelloNear
// on testnet without a wallet. Each judge gets their own user. Limits keep the shared NEAR AI credit and the shared
// demo wallet alive: runs per demo user, runs and sign-ups per IP per hour, sent payments per demo user.
import type { IncomingMessage } from 'node:http'
import { config } from './config.ts'
import { newId, randomToken, sha256 } from './crypto.ts'
import { query } from './db.ts'
import { HttpError } from './http.ts'
import type { User } from './auth.ts'

// Behind the Cloudflare Tunnel the visitor's address is in CF-Connecting-IP; the container firewall only lets the
// tunnel host reach the backend, so the header cannot be set by anyone else there.
export const clientIp = (req: IncomingMessage) => String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? 'unknown')

// In memory: one backend instance. A restart forgets the hourly windows, the per-user limits are in the DB.
const windows = new Map<string, number[]>()
function hit(key: string, max: number, now = Date.now()): boolean {
  const recent = (windows.get(key) ?? []).filter((t) => t > now - 3600_000)
  if (recent.length >= max) { windows.set(key, recent); return false }
  recent.push(now)
  windows.set(key, recent)
  return true
}
export const resetDemoWindows = () => windows.clear()
// Drops keys with no hit in the last hour, so one-off visitors do not stay in memory until a restart.
export function sweepDemoWindows(now = Date.now()): number {
  for (const [key, times] of windows) if (!times.some((t) => t > now - 3600_000)) windows.delete(key)
  return windows.size
}
setInterval(sweepDemoWindows, 10 * 60_000).unref()

export async function createDemoUser(req: IncomingMessage): Promise<{ user: User; token: string }> {
  if (!config.demoMode) throw new HttpError(404, 'not_found')
  if (!hit(`signup:${clientIp(req)}`, config.demo.signupsPerIpPerHour)) throw new HttpError(429, 'demo_rate_limited')
  const user: User = { id: newId('usr'), nearAccountId: `demo:${randomToken(9)}`, demo: true }
  // `demo:` cannot be a NEAR account id (no colons), so a demo user never collides with a wallet login.
  await query('insert into users (id, near_account_id, is_demo) values ($1, $2, true)', [user.id, user.nearAccountId])
  const token = randomToken()
  await query('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [sha256(token), user.id, new Date(Date.now() + config.sessionTtlMs)])
  return { user, token }
}

// Before every chat, approve/decline and builder run of a demo user.
export async function assertDemoRunAllowed(user: User, req: IncomingMessage) {
  if (!user.demo) return
  const [{ n }] = await query<{ n: number }>('select count(*)::int as n from runs r join minds m on m.id = r.mind_id where m.user_id = $1', [user.id])
  if (n >= config.demo.runsPerUser) throw new HttpError(429, 'demo_run_limit', { limit: config.demo.runsPerUser })
  if (!hit(`run:${clientIp(req)}`, config.demo.runsPerIpPerHour)) throw new HttpError(429, 'demo_rate_limited')
}

// Owner-only actions a demo user cannot take: the FE shows "connect a wallet to do this".
export function denyDemo(user: User, action: string) {
  if (user.demo) throw new HttpError(403, 'demo_not_allowed', { action })
}

// The payment cap for a demo user, enforced in sendPayment (src/payments.ts) under a per-user lock.
export const demoPaymentCap = (userId: string) => ({ userId, max: config.demo.paymentsPerUser, message: `demo limit: ${config.demo.paymentsPerUser} payments per visitor` })

// Deletes demo users older than the retention (their Minds, runs, sessions cascade). `dropMind` removes what the
// engine stores for a Mind (workflows, schedules) first.
export async function cleanupDemoUsers(dropMind: (mindId: string) => Promise<void>): Promise<number> {
  const users = await query<{ id: string }>(`select id from users where is_demo and created_at < now() - make_interval(days => $1)`, [config.demo.retentionDays])
  for (const u of users) {
    for (const m of await query<{ id: string }>('select id from minds where user_id = $1', [u.id])) await dropMind(m.id).catch(() => {})
    await query('delete from users where id = $1', [u.id])
  }
  return users.length
}
