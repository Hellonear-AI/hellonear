// Connections & Secrets (#18). The LLM only ever sees {{secrets.NAME}} placeholders;
// values are filled in at tool execution and redacted by value everywhere they could leak.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { z } from 'zod'

export const SECRETS_KEY = 'secrets'
export const REDACTED = '••••'

export const secretSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'secret names are UPPER_SNAKE_CASE'),
  value: z.string().min(4),
  allowedHosts: z.array(z.string().min(1)).min(1),
})
export type Secret = z.infer<typeof secretSchema>

const PLACEHOLDER = /\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}/g

// Replaces placeholders with values and returns the names that were used.
export function fillSecrets(text: string, secrets: Map<string, Secret>, used: Set<string>): string {
  return text.replace(PLACEHOLDER, (_, name: string) => {
    const secret = secrets.get(name)
    if (!secret) throw new Error(`unknown secret ${name}`)
    used.add(name)
    return secret.value
  })
}

// Each used secret may only go to one of its allowed hosts.
export function assertHostAllowed(host: string, used: Iterable<string>, secrets: Map<string, Secret>) {
  for (const name of used) {
    const allowed = secrets.get(name)!.allowedHosts.map((h) => h.toLowerCase())
    if (!allowed.includes(host.toLowerCase())) throw new Error(`secret ${name} may not be sent to ${host}`)
  }
}

// Blocks requests to the engine itself, the local network and cloud metadata (SSRF).
export function assertPublicHttpsUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error('only https URLs are allowed')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) throw new Error(`host ${host} is not allowed`)
  if (isIP(host) && isPrivateIp(host)) throw new Error(`host ${host} is not allowed`)
  return url
}

// A public hostname can still resolve to a private address (DNS rebinding), so check every A/AAAA record.
export async function assertResolvesPublic(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return
  const records = await lookup(host, { all: true })
  const bad = records.find((r) => isPrivateIp(r.address))
  if (bad) throw new Error(`host ${host} resolves to a non-public address`)
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80') || ip.startsWith('::ffff:')
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

// Replaces every secret value (not just field names) anywhere inside a value.
export function redact<T>(value: T, secretValues: string[]): T {
  if (!secretValues.length) return value
  const sorted = [...secretValues].sort((a, b) => b.length - a.length)
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return sorted.reduce((s, secret) => s.split(secret).join(REDACTED), v)
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(value) as T
}
