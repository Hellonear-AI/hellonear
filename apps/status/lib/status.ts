// The status page reads the backend's public GET /v1/status (apps/be, docs/api-contract.md). The shape below
// is that contract; keep the two in step.

export type State = "operational" | "degraded" | "down" | "unknown"
export type BucketState = "operational" | "degraded" | "down" | "none"

export type Service = {
  id: string
  name: string
  group: "HelloNear" | "NEAR AI" | "NEAR" | "Partners"
  status: State
  latencyMs: number | null
  checkedAt: string | null
  detail: string | null
  impact: string
  uptime24h: number | null
  uptime7d: number | null
  // checks / bad / detail are optional: probes in the bucket, how many were down or slow, and the last problem's detail.
  history: { start: string; status: BucketState; checks?: number; bad?: number; detail?: string | null }[]
}

// A run of failed checks of one service, worked out by the backend from the last 7 days of probes.
export type Incident = { service: string; name: string; status: "down" | "degraded"; start: string; end: string | null; minutes: number; detail: string | null }

export type Status = { updatedAt: string; overall: "operational" | "degraded" | "down"; services: Service[]; incidents?: Incident[] }

export const GROUPS: Service["group"][] = ["HelloNear", "NEAR AI", "NEAR", "Partners"]

// Read when the page is rendered, so a deploy can point it elsewhere (STATUS_API_URL) without a rebuild of the code.
export const statusUrl = () => process.env.STATUS_API_URL ?? "https://api.hellonear.xyz/v1/status"

// A plain fetch, revalidated every 30 s by Next (the backend caches its answer for 30 s too). Any failure
// becomes null, and the page says it can't reach the status API rather than showing everything as down.
export async function loadStatus(): Promise<Status | null> {
  if (process.env.STATUS_FIXTURE === "1") return (await import("./fixture")).fixture()
  try {
    const res = await fetch(statusUrl(), { next: { revalidate: 30 }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const body = (await res.json()) as Status
    return Array.isArray(body?.services) ? body : null
  } catch {
    return null
  }
}

export const LABEL: Record<State, string> = { operational: "Operational", degraded: "Degraded", down: "Down", unknown: "No data yet" }

export const HEADLINE: Record<Status["overall"], string> = {
  operational: "All systems operational",
  degraded: "Some services are slow",
  down: "Some services are down",
}

// The services that are not operational, worst first, for the banner at the top.
export function incidents(s: Status): Service[] {
  const rank: Record<State, number> = { down: 0, degraded: 1, unknown: 2, operational: 3 }
  return s.services.filter((x) => x.status === "down" || x.status === "degraded").sort((a, b) => rank[a.status] - rank[b.status])
}

// "3 min ago" style, from the page's own clock.
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never"
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

// The tooltip's lines for one 30-minute bar. Probes run every 5 minutes, so each bad probe stands for about 5 minutes.
export const PROBE_MINUTES = 5
// The colour of one bar, like status.claude.com: green when every check was fine, yellow when only some failed
// (or it was only slow), red when every check failed. Without the optional counts it falls back to the bucket status.
export type Level = "ok" | "partial" | "major" | "none"
export function levelOf(b: Service["history"][number]): Level {
  if (b.status === "none") return "none"
  if (b.status === "operational") return "ok"
  if (b.status === "degraded") return "partial"
  if (typeof b.checks === "number" && typeof b.bad === "number" && b.checks > 0) return b.bad >= b.checks ? "major" : "partial"
  return "major"
}
export const LEVEL_LABEL: Record<Level, string> = { ok: "Operational", partial: "Partial outage", major: "Major outage", none: "No checks" }

export function bucketLines(b: Service["history"][number], locale?: string): { when: string; state: string; level: Level; minutes: number | null; detail: string | null } {
  const start = new Date(b.start)
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  // UTC, said so: the page is rendered on the server, whose clock zone is not the reader's.
  const t = (d: Date) => d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
  const when = `${start.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" })}, ${t(start)} to ${t(end)} UTC`
  const level = levelOf(b)
  const state = b.status === "degraded" ? "Slow" : LEVEL_LABEL[level]
  const minutes = b.bad && b.bad > 0 ? b.bad * PROBE_MINUTES : null
  return { when, state, level, minutes, detail: b.detail ?? null }
}

// The last `days` calendar days (UTC), newest first, each with its incidents (by start time), so a quiet day
// still shows as "No incidents reported".
export function incidentDays(list: Incident[], days = 7, now = Date.now()): { day: string; items: Incident[] }[] {
  const out: { day: string; items: Incident[] }[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(now - i * 86_400_000).toISOString().slice(0, 10)
    out.push({ day: d, items: list.filter((x) => x.start.slice(0, 10) === d).sort((a, b) => b.start.localeCompare(a.start)) })
  }
  return out
}

// "2 h 40 min", "35 min".
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

export const pct = (n: number | null) => (n === null ? "No data" : `${n.toFixed(2)}% uptime`)
