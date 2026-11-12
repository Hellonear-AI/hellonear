// The public status page (status.hellonear.xyz): every 5 minutes the backend checks HelloNear itself and each outside
// service it depends on, stores one row per check (`service_checks`, kept 8 days), and `GET /v1/status` answers from
// those rows. On 13 Nov NEAR AI's embeddings endpoint hung and 1Click's quote API timed out for hours, and the team only
// found out with curl; the page shows it, with what each outage means for a HelloNear user.
// The NEAR AI checks run in the engine (`GET /internal/v1/probes`), since only the engine holds the NEAR AI key.
// Upstream URLs are read per call, so tests can point them at fakes. Details are short and never carry keys or URLs.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { config } from './config.ts'
import { query } from './db.ts'
import { engineFetch } from './engine.ts'
import { fetchFailure } from './http.ts'
import { report, verdict, type Check, type CheckStatus, type ServiceMeta, type StatusReport } from './statusMath.ts'

export const PROBE_EVERY_MS = 5 * 60_000
const KEEP_DAYS = 8
const CACHE_MS = 30_000

const oneClick = () => process.env.STATUS_ONECLICK_URL ?? 'https://1click.chaindefuser.com'
const market = () => process.env.STATUS_MARKET_URL ?? 'https://market.near.ai'
const teeExplorer = () => process.env.TEE_EXPLORER_URL ?? 'https://proof.t16z.com'
// rpc.testnet.near.org is deprecated (12 Nov), so the check uses FastNear unless told otherwise.
const nearRpc = () => process.env.STATUS_NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com'

// USDC on NEAR to USDC on Base, as listed by 1Click's GET /v0/tokens on 13 Nov. A dry quote moves nothing.
const QUOTE_FROM = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'
const QUOTE_TO = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near'

export const SERVICES: (ServiceMeta & { degradedMs: number })[] = [
  { id: 'hellonear-api', name: 'HelloNear API', group: 'HelloNear', degradedMs: 1_000, impact: 'The web app, sign-in and every Mind stop working.' },
  { id: 'hellonear-engine', name: 'HelloNear engine', group: 'HelloNear', degradedMs: 2_000, impact: 'Minds cannot reply, run skills or run Autopilot jobs.' },
  { id: 'nearai-chat', name: 'NEAR AI Cloud: chat', group: 'NEAR AI', degradedMs: 10_000, impact: 'Minds cannot reply; nothing is paid or sent without a reply.' },
  { id: 'nearai-embeddings', name: 'NEAR AI Cloud: embeddings', group: 'NEAR AI', degradedMs: 5_000, impact: 'Chats and Autopilot run without searching past chats until it answers.' },
  { id: 'near-intents-quote', name: 'NEAR Intents (1Click quotes)', group: 'NEAR', degradedMs: 15_000, impact: 'Cross-chain stablecoin quotes can\'t be fetched; nothing is ever sent either way.' },
  { id: 'outlayer', name: 'OutLayer wallets', group: 'NEAR', degradedMs: 3_000, impact: 'Minds cannot read balances or pay; no payment goes out unchecked.' },
  { id: 'near-rpc', name: 'NEAR testnet RPC', group: 'NEAR', degradedMs: 3_000, impact: 'Account checks before a payment and invoice payment checks fail.' },
  { id: 'agent-market', name: 'NEAR AI Agent Market', group: 'Partners', degradedMs: 5_000, impact: 'Minds cannot search the Agent Market or get an agent\'s price.' },
  { id: 'tee-explorer', name: 'TEE Attestation Explorer', group: 'Partners', degradedMs: 5_000, impact: 'Check it in TEE Explorer cannot open a report; replies are still verified.' },
]

type Outcome = { ok: boolean; detail?: string; degraded?: boolean }
type Result = { service: string; status: CheckStatus; latencyMs: number | null; detail: string | null }

const clip = (text: string, max = 160) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

// Times one probe and turns how it went into a stored check. A timeout or error is down, never thrown.
async function timed(service: string, timeoutMs: number, run: (signal: AbortSignal) => Promise<Outcome>): Promise<Result> {
  const meta = SERVICES.find((s) => s.id === service)!
  const started = Date.now()
  try {
    const out = await run(AbortSignal.timeout(timeoutMs))
    const latencyMs = Date.now() - started
    const status = out.ok && out.degraded ? 'degraded' : verdict(out.ok, latencyMs, meta.degradedMs)
    return { service, status, latencyMs, detail: out.detail ? clip(out.detail) : status === 'degraded' && out.ok ? `Slow: answered in ${(latencyMs / 1000).toFixed(1)} s.` : null }
  } catch (e) {
    const reason = fetchFailure(e)
    return { service, status: 'down', latencyMs: null, detail: reason === 'timeout' ? `No answer in ${timeoutMs / 1000} s.` : `Could not reach it (${reason}).` }
  }
}

const getOk = (url: string, signal: AbortSignal, init: RequestInit = {}) =>
  fetch(url, { redirect: 'manual', ...init, signal }).then((r) => ({ ok: r.ok, detail: r.ok ? undefined : `Answered HTTP ${r.status}.` }))

const probes: Record<string, () => Promise<Result>> = {
  'hellonear-api': () => timed('hellonear-api', 5_000, async () => {
    await query('select 1')
    return { ok: true }
  }),
  'hellonear-engine': () => timed('hellonear-engine', 10_000, async (signal) => {
    const res = await engineFetch('/v1/health', { signal })
    return { ok: res.ok, detail: res.ok ? undefined : `Answered HTTP ${res.status}.` }
  }),
  'near-intents-quote': () => timed('near-intents-quote', 30_000, async (signal) => {
    const res = await fetch(`${oneClick()}/v0/quote`, {
      method: 'POST', signal, redirect: 'error', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100, originAsset: QUOTE_FROM, destinationAsset: QUOTE_TO, amount: '10000000',
        depositType: 'ORIGIN_CHAIN', recipient: '0x8ba1f109551bD432803012645Ac136ddd64DBA72', recipientType: 'DESTINATION_CHAIN',
        refundTo: 'hellonear.near', refundType: 'ORIGIN_CHAIN', deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
      }),
    })
    const body = (await res.json().catch(() => ({}))) as { quote?: unknown; message?: string }
    if (res.ok && body.quote) return { ok: true }
    return { ok: false, detail: `1Click answered HTTP ${res.status}${body.message ? `: ${body.message}` : '.'}` }
  }),
  'outlayer': () => timed('outlayer', 10_000, (signal) => getOk(`${config.outlayerUrl}/health`, signal)),
  'near-rpc': () => timed('near-rpc', 10_000, async (signal) => {
    const res = await fetch(nearRpc(), { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'status', method: 'status', params: [] }) })
    const body = (await res.json().catch(() => ({}))) as { result?: { sync_info?: { syncing?: boolean } } }
    if (!res.ok || !body.result) return { ok: false, detail: `Answered HTTP ${res.status} without a status.` }
    return body.result.sync_info?.syncing ? { ok: true, degraded: true, detail: 'The node is still syncing.' } : { ok: true }
  }),
  'agent-market': () => timed('agent-market', 15_000, async (signal) => {
    const res = await fetch(`${market()}/v1/agents?limit=1`, { signal, redirect: 'error' })
    const body = (await res.json().catch(() => ({}))) as { agents?: unknown[] }
    if (res.ok && Array.isArray(body.agents)) return { ok: true }
    return { ok: false, detail: `Answered HTTP ${res.status}${res.ok ? ' without a catalog.' : '.'}` }
  }),
  'tee-explorer': () => timed('tee-explorer', 15_000, (signal) => getOk(teeExplorer(), signal, { method: 'HEAD' })),
}

type EngineProbe = { id: string; status: CheckStatus; latencyMs: number | null; detail: string | null }

// NEAR AI chat and embeddings, checked by the engine in one call. Without an answer from the engine nothing is known
// about NEAR AI, so nothing is stored for them this round (the page then shows "none" for that half hour).
async function nearAiProbes(): Promise<Result[]> {
  try {
    const res = await engineFetch('/internal/v1/probes', { signal: AbortSignal.timeout(45_000) })
    if (!res.ok) return []
    const body = (await res.json()) as { probes?: EngineProbe[] }
    return (body.probes ?? [])
      .filter((p) => (p.id === 'nearai-chat' || p.id === 'nearai-embeddings') && ['operational', 'degraded', 'down'].includes(p.status))
      .map((p) => ({ service: p.id, status: p.status, latencyMs: typeof p.latencyMs === 'number' ? Math.round(p.latencyMs) : null, detail: p.detail ? clip(String(p.detail)) : null }))
  } catch {
    return []
  }
}

// One round: every probe at once (one failing never stops the others), one row each, old rows dropped.
export async function runProbes(): Promise<Result[]> {
  const settled = await Promise.allSettled([...Object.values(probes).map((p) => p()), nearAiProbes()])
  const results = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
  for (const r of results) {
    await query('insert into service_checks (service, status, latency_ms, detail) values ($1, $2, $3, $4)', [r.service, r.status, r.latencyMs, r.detail])
  }
  await query(`delete from service_checks where checked_at < now() - make_interval(days => $1)`, [KEEP_DAYS])
  cached = undefined
  return results
}

let cached: { at: number; report: StatusReport } | undefined
export const resetStatusCache = () => { cached = undefined }

export async function statusReport(now = new Date()): Promise<StatusReport> {
  if (cached && now.getTime() - cached.at < CACHE_MS) return cached.report
  const rows = await query<{ service: string; checked_at: Date; status: CheckStatus; latency_ms: number | null; detail: string | null }>(
    `select service, checked_at, status, latency_ms, detail from service_checks where checked_at > now() - interval '7 days'`,
  )
  const checks: Check[] = rows.map((r) => ({ service: r.service, checkedAt: new Date(r.checked_at), status: r.status, latencyMs: r.latency_ms, detail: r.detail }))
  const meta = SERVICES.map(({ id, name, group, impact }) => ({ id, name, group, impact }))
  const out = report(meta, checks, now)
  cached = { at: now.getTime(), report: out }
  return out
}

// Public and cross-origin on purpose: the status page lives on Vercel, reads it without cookies, and it holds nothing private.
const PUBLIC_HEADERS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type' }

export async function serveStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') return void res.writeHead(204, { ...PUBLIC_HEADERS, 'access-control-max-age': '86400' }).end()
  if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405, { ...PUBLIC_HEADERS, 'content-type': 'application/json' }).end(JSON.stringify({ error: 'method_not_allowed' }))
  const body = JSON.stringify(await statusReport())
  res.writeHead(200, { ...PUBLIC_HEADERS, 'content-type': 'application/json', 'cache-control': 'public, max-age=30' })
  res.end(req.method === 'HEAD' ? undefined : body)
}

export function startStatusProbes(): void {
  const round = () => runProbes().catch((e) => console.error('status probes failed', e instanceof Error ? e.message : e))
  // A short pause first, so the engine (started alongside) is up for the first round.
  setTimeout(round, 20_000).unref()
  setInterval(round, PROBE_EVERY_MS).unref()
}
