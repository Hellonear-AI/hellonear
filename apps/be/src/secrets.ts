// Account-level secrets (#18). Values are encrypted at rest, never returned to the browser, and only
// decrypted to hand them to the engine for one run (docs/api-contract.md §2).
import { z } from 'zod'
import { config } from './config.ts'
import { decrypt, encrypt, newId } from './crypto.ts'
import { query } from './db.ts'
import type { EngineSecret } from './engine.ts'

// Same rules as the engine's secretSchema, so a stored secret is never rejected at run time.
export const secretNameSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'secret names are UPPER_SNAKE_CASE')
const hostSchema = z.string().toLowerCase().regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'a host name such as api.example.com, without scheme or path')
export const putSecretSchema = z.object({
  value: z.string().min(4).max(8192),
  allowedHosts: z.array(hostSchema).min(1).max(10),
})

export type SecretSummary = { name: string; allowedHosts: string[]; createdAt: string; updatedAt: string }

const aad = (userId: string, name: string) => `${userId}:${name}`

export async function putSecret(userId: string, name: string, body: z.infer<typeof putSecretSchema>): Promise<SecretSummary> {
  const [row] = await query(
    `insert into secrets (id, user_id, name, ciphertext, allowed_hosts) values ($1, $2, $3, $4, $5)
     on conflict (user_id, name) do update set ciphertext = excluded.ciphertext, allowed_hosts = excluded.allowed_hosts, updated_at = now()
     returning name, allowed_hosts, created_at, updated_at`,
    [newId('sec'), userId, name, encrypt(config.secretsMasterKey, body.value, aad(userId, name)), [...new Set(body.allowedHosts)]],
  )
  return toSummary(row)
}

export async function listSecrets(userId: string): Promise<SecretSummary[]> {
  return (await query('select name, allowed_hosts, created_at, updated_at from secrets where user_id = $1 order by name', [userId])).map(toSummary)
}

export async function deleteSecret(userId: string, name: string): Promise<boolean> {
  return (await query('delete from secrets where user_id = $1 and name = $2 returning id', [userId, name])).length > 0
}

// Decrypted for one engine call only; callers must never log or store the result.
export async function secretsForRun(userId: string): Promise<EngineSecret[]> {
  const rows = await query<{ name: string; ciphertext: string; allowed_hosts: string[] }>('select name, ciphertext, allowed_hosts from secrets where user_id = $1', [userId])
  return rows.map((r) => ({ name: r.name, value: decrypt(config.secretsMasterKey, r.ciphertext, aad(userId, r.name)), allowedHosts: r.allowed_hosts }))
}

const toSummary = (r: any): SecretSummary => ({ name: r.name, allowedHosts: r.allowed_hosts, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() })
