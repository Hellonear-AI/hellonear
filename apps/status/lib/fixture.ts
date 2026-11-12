// Sample data for working on the page before the backend's /v1/status is live (STATUS_FIXTURE=1 bun run dev).
// It mirrors 13 Nov 2026: NEAR AI's embeddings hung and 1Click's quote API timed out, everything else answered.
import type { BucketState, Service, Status } from "./status"

const BUCKETS = 48
const HALF_HOUR = 30 * 60 * 1000

function history(now: number, badFrom: number, bad: BucketState): Service["history"] {
  return Array.from({ length: BUCKETS }, (_, i) => ({
    start: new Date(now - (BUCKETS - i) * HALF_HOUR).toISOString(),
    status: i < 4 ? "none" : i >= badFrom ? bad : "operational",
  }))
}

export function fixture(): Status {
  const now = Date.now()
  const at = new Date(now - 90_000).toISOString()
  const ok = (id: string, name: string, group: Service["group"], latencyMs: number, impact: string): Service => ({
    id, name, group, status: "operational", latencyMs, checkedAt: at, detail: null, impact, uptime24h: 100, uptime7d: 99.95, history: history(now, BUCKETS, "operational"),
  })
  return {
    updatedAt: at,
    overall: "down",
    services: [
      ok("hellonear-api", "HelloNear API", "HelloNear", 42, "The web app can't sign in, chat or pay."),
      ok("hellonear-engine", "Mind engine", "HelloNear", 18, "Minds can't answer; nothing is paid."),
      ok("nearai-chat", "NEAR AI Cloud: chat models", "NEAR AI", 1450, "Minds can't answer until it is back."),
      { ...ok("nearai-embeddings", "NEAR AI Cloud: embeddings", "NEAR AI", 0, "Chats and Autopilot run without searching past chats until it answers."), status: "down", latencyMs: null, detail: "No answer in 8 s", uptime24h: 62.5, uptime7d: 94.6, history: history(now, 30, "down") },
      { ...ok("near-intents-quote", "NEAR Intents: 1Click quotes", "NEAR", 0, "Cross-chain stablecoin quotes can't be fetched; nothing is ever sent either way."), status: "down", latencyMs: null, detail: "1Click answered 500 after 25 s", uptime24h: 91.67, uptime7d: 98.8, history: history(now, 44, "down") },
      ok("outlayer", "OutLayer wallets (testnet)", "NEAR", 310, "Payments, limits and Freeze wait until it is back; nothing is sent."),
      ok("near-rpc", "NEAR RPC (FastNear testnet)", "NEAR", 220, "Account lookups and payment checks fail; Minds say so and don't pay."),
      { ...ok("agent-market", "NEAR AI Agent Market", "Partners", 2900, "Agent searches and quotes can't be fetched."), status: "degraded", detail: "Answered in 2.9 s", uptime24h: 100, uptime7d: 100 },
      ok("tee-explorer", "Phala TEE Attestation Explorer", "Partners", 640, "The Verified badge still works; opening the report in TEE Explorer doesn't."),
    ],
  }
}
