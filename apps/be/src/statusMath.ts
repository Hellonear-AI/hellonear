// The public status page's numbers (status.hellonear.xyz, `GET /v1/status`), worked out from stored checks. Pure, so it
// is unit-tested without Postgres or the network. `src/status.ts` runs the probes and stores the checks.

export type CheckStatus = 'operational' | 'degraded' | 'down'
export type ServiceStatus = CheckStatus | 'unknown'
export type BucketStatus = CheckStatus | 'none'
export type Group = 'HelloNear' | 'NEAR AI' | 'NEAR' | 'Partners'

export type ServiceMeta = { id: string; name: string; group: Group; impact: string }
export type Check = { service: string; checkedAt: Date; status: CheckStatus; latencyMs: number | null; detail: string | null }

export type ServiceReport = ServiceMeta & {
  status: ServiceStatus
  latencyMs: number | null
  checkedAt: string | null
  detail: string | null
  uptime24h: number | null
  uptime7d: number | null
  history: Bucket[]
}
// One bar of the 24-hour strip. `checks`, `bad` and `detail` feed the hover text (how many probes ran in that half
// hour, how many were down or degraded, and what the last bad one said).
export type Bucket = { start: string; status: BucketStatus; checks: number; bad: number; detail: string | null }
// A run of non-operational checks of one service: a single good check ends it. Down if any check in it was down.
export type Incident = { service: string; name: string; status: 'down' | 'degraded'; start: string; end: string | null; minutes: number; detail: string | null }
export type StatusReport = { updatedAt: string; overall: CheckStatus; services: ServiceReport[]; incidents: Incident[] }

export const BUCKET_MS = 30 * 60_000
export const BUCKETS = 48
// Probes run every 5 minutes; with no check for three rounds the last one is too old to show as current.
export const STALE_MS = 15 * 60_000
export const MAX_INCIDENTS = 100

const RANK: Record<BucketStatus, number> = { none: 0, operational: 1, degraded: 2, down: 3 }
const worse = (a: BucketStatus, b: BucketStatus): BucketStatus => (RANK[b] > RANK[a] ? b : a)

// Share of checks that answered (degraded counts as up), as a percent with 2 decimals; null without checks.
export function uptime(checks: Check[]): number | null {
  if (checks.length === 0) return null
  const up = checks.filter((c) => c.status !== 'down').length
  return Math.round((up / checks.length) * 10_000) / 100
}

const byTime = (a: Check, b: Check) => a.checkedAt.getTime() - b.checkedAt.getTime()

// 48 half-hour buckets ending with the one that holds `now`, oldest first; each takes the worst check inside it.
export function buckets(checks: Check[], now: Date): Bucket[] {
  const end = Math.floor(now.getTime() / BUCKET_MS) * BUCKET_MS + BUCKET_MS
  const first = end - BUCKETS * BUCKET_MS
  const out: Bucket[] = Array.from({ length: BUCKETS }, (_, i) => ({ start: new Date(first + i * BUCKET_MS).toISOString(), status: 'none', checks: 0, bad: 0, detail: null }))
  for (const c of [...checks].sort(byTime)) {
    const i = Math.floor((c.checkedAt.getTime() - first) / BUCKET_MS)
    if (i < 0 || i >= BUCKETS) continue
    const b = out[i]
    b.status = worse(b.status, c.status)
    b.checks += 1
    if (c.status !== 'operational') {
      b.bad += 1
      b.detail = c.detail
    }
  }
  return out
}

// Incidents from one list of checks (any services, any order): newest first, at most MAX_INCIDENTS.
export function incidents(meta: ServiceMeta[], checks: Check[], now: Date): Incident[] {
  const out: Incident[] = []
  for (const m of meta) {
    let run: Incident | undefined
    for (const c of checks.filter((x) => x.service === m.id).sort(byTime)) {
      if (c.status === 'operational') {
        if (run) {
          run.end = c.checkedAt.toISOString()
          out.push(run)
          run = undefined
        }
        continue
      }
      run ??= { service: m.id, name: m.name, status: 'degraded', start: c.checkedAt.toISOString(), end: null, minutes: 0, detail: null }
      if (c.status === 'down') run.status = 'down'
      run.detail = c.detail
    }
    if (run) out.push(run)
  }
  for (const i of out) i.minutes = Math.round(((i.end ? Date.parse(i.end) : now.getTime()) - Date.parse(i.start)) / 60_000)
  return out.sort((a, b) => Date.parse(b.start) - Date.parse(a.start)).slice(0, MAX_INCIDENTS)
}

// HelloNear's own API or engine down means the app is down; anything else down or slow means it is degraded.
export function overall(services: { id: string; group: Group; status: ServiceStatus }[]): CheckStatus {
  if (services.some((s) => s.group === 'HelloNear' && s.status === 'down')) return 'down'
  if (services.some((s) => s.status === 'down' || s.status === 'degraded')) return 'degraded'
  return 'operational'
}

// One report from every stored check of the last 7 days (any order), in the order of `meta`.
export function report(meta: ServiceMeta[], checks: Check[], now: Date): StatusReport {
  const day = now.getTime() - 24 * 3600_000
  const week = now.getTime() - 7 * 24 * 3600_000
  const services = meta.map((m): ServiceReport => {
    const mine = checks.filter((c) => c.service === m.id && c.checkedAt.getTime() > week).sort(byTime)
    const last = mine.at(-1)
    const fresh = last !== undefined && now.getTime() - last.checkedAt.getTime() <= STALE_MS
    return {
      ...m,
      status: fresh ? last.status : 'unknown',
      latencyMs: last?.latencyMs ?? null,
      checkedAt: last ? last.checkedAt.toISOString() : null,
      detail: last && !fresh ? 'No check in the last 15 minutes.' : (last?.detail ?? null),
      uptime24h: uptime(mine.filter((c) => c.checkedAt.getTime() > day)),
      uptime7d: uptime(mine),
      history: buckets(mine, now),
    }
  })
  const recent = checks.filter((c) => c.checkedAt.getTime() > week)
  return { updatedAt: now.toISOString(), overall: overall(services), services, incidents: incidents(meta, recent, now) }
}

// A probe's verdict from how it went: an error or timeout is down, an answer slower than the threshold is degraded.
export function verdict(ok: boolean, latencyMs: number, degradedMs: number): CheckStatus {
  if (!ok) return 'down'
  return latencyMs > degradedMs ? 'degraded' : 'operational'
}
