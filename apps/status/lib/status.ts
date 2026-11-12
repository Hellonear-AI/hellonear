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
  history: { start: string; status: BucketState }[]
}

export type Status = { updatedAt: string; overall: "operational" | "degraded" | "down"; services: Service[] }

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

export const pct = (n: number | null) => (n === null ? "No data" : `${n.toFixed(2)}% uptime`)
