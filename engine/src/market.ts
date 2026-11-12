// NEAR AI Agent Market (market.near.ai): find agents other people built and ask what a job would cost, as a preview
// only. The catalog and the price are public and need no account (market.near.ai/llms.txt, read 12 Nov). Paying is an
// x402 call: one NEP-366 signed delegate action moving USDC on NEAR **mainnet** (`accepts[].network` "near:mainnet",
// /.well-known/x402, read 12 Nov). Every HelloNear wallet is on testnet, so this Mind can search and quote, never hire.
// The quote is the agent's own 402 answer to the task text: an unpaid SendMessage creates no task and moves nothing
// (live 12 Nov: infinito-absoluto answered 402, 15 USDC, window 87,000 s).
import { createTool } from '@mastra/core/tools'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { withCount } from './counted.ts'
import { fromUnits, toUnits } from './crosschain.ts'

// Read per call, not at import, so tests can point them at a fake. Each agent lives on its own subdomain, so the
// agent URL is a template.
const market = () => process.env.MARKET_URL ?? 'https://market.near.ai'
const agentBase = (handle: string) => (process.env.MARKET_AGENT_URL ?? 'https://{handle}.market.near.ai').replace('{handle}', handle)

// A handle becomes a hostname, so only a plain DNS label is accepted: no dots, slashes or ports to point it elsewhere.
export const HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const AGENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const CATEGORIES = ['automation', 'creative', 'customer_support', 'data', 'dev_tools', 'events', 'finance', 'legal_compliance', 'marketing', 'operations', 'research', 'sales', 'travel', 'other'] as const

export const NOT_HIRED = 'Quote only: nothing was sent to the agent and nothing was paid. Hiring on the Agent Market is paid in USDC on NEAR mainnet, and this Mind\'s wallet is on testnet, so it cannot hire yet.'

const get = async <T>(url: string): Promise<{ status: number; body: T | undefined }> => {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
  return { status: res.status, body: (await res.json().catch(() => undefined)) as T | undefined }
}

type Plan = { is_default?: boolean; display_name?: string; price_amount?: string; sla_seconds?: number | null }
const defaultPlan = async (agentId: string): Promise<Plan | undefined> => {
  const { status, body } = await get<Plan[]>(`${market()}/v1/agents/${agentId}/pricing-plans`)
  return status === 200 && Array.isArray(body) ? body.find((p) => p.is_default) : undefined
}

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

const agentRow = z.object({
  handle: z.string(), agentId: z.string(), name: z.string(), description: z.string(), category: z.string(),
  availableNow: z.boolean(), deliveredJobs: z.number(), successRate: z.number().nullable(),
  builderVerified: z.boolean().describe('the market verified the builder\'s identity'),
  priceUsd: z.string().nullable().describe('the default price per job in USD, paid 1:1 in USDC; null when unknown'),
})

type CatalogAgent = {
  agent_id: string; handle: string; name: string; description?: string; category?: string; available_now?: boolean
  delivered_jobs?: number; success_rate?: number | null; builder?: { verification?: { level?: string } | null } | null
}

export const marketSearch = createTool(withCount('agents', {
  id: 'market_search',
  description: 'Search the NEAR AI Agent Market (market.near.ai) for agents other people built that do paid jobs: research, data, writing, dev tools and more. Returns each agent\'s handle, what it does, whether it can take work now, its track record, whether its builder is verified, and its price per job in USD (paid in USDC). Read-only; pays nothing.',
  inputSchema: z.object({
    query: z.string().trim().min(2).max(100).describe('what the owner needs done, in a few words, e.g. "market research"'),
    category: z.enum(CATEGORIES).optional(),
    limit: z.number().int().min(1).max(10).optional().describe('how many agents, 5 when left out'),
  }),
  outputSchema: z.object({ query: z.string(), agents: z.array(agentRow) }),
  execute: async ({ query, category, limit }) => {
    const params = new URLSearchParams({ q: query, sort: 'delivered', limit: String(limit ?? 5), ...(category ? { category } : {}) })
    const { status, body } = await get<{ agents?: CatalogAgent[] }>(`${market()}/v1/agents?${params}`)
    if (status !== 200 || !Array.isArray(body?.agents)) throw new Error(`Agent Market: catalog HTTP ${status}`)
    // Only rows whose handle and id are safe to reuse in a URL; the price comes from each agent's default plan.
    const found = body.agents.filter((a) => HANDLE.test(a.handle) && AGENT_ID.test(a.agent_id)).slice(0, limit ?? 5)
    const prices = await Promise.all(found.map((a) => defaultPlan(a.agent_id).then((p) => p?.price_amount ?? null, () => null)))
    return {
      query,
      agents: found.map((a, i) => ({
        handle: a.handle, agentId: a.agent_id, name: a.name, description: shorten(a.description ?? '', 240), category: a.category ?? '',
        availableNow: a.available_now === true, deliveredJobs: a.delivered_jobs ?? 0, successRate: a.success_rate ?? null,
        builderVerified: a.builder?.verification?.level === 'identity_verified', priceUsd: prices[i],
      })),
    }
  },
}))

type Accept = { scheme?: string; network?: string; asset?: string; amount?: string; payTo?: string; maxTimeoutSeconds?: number }

export const marketQuote = createTool({
  id: 'market_quote',
  description: 'Ask one NEAR AI Agent Market agent what a job would cost, using the task the owner wrote. The agent\'s own payment request (HTTP 402) gives the exact price in USDC, the network and the time window. A quote only: the agent does not start, nothing is paid, and this Mind cannot hire (the market is paid in USDC on NEAR mainnet; this wallet is testnet). The agent\'s owner can read the task text, so it must hold no secrets or private data.',
  inputSchema: z.object({
    handle: z.string().regex(HANDLE, 'an agent handle from market_search, e.g. "qadri-research"'),
    agentId: z.string().regex(AGENT_ID, 'the agentId market_search gave for that handle'),
    task: z.string().trim().min(10).max(4000).describe('the job: a title on the first line, then the brief, in the owner\'s words'),
    maxUsdc: z.string().regex(/^\d{1,6}(\.\d{1,6})?$/, 'a decimal string, e.g. "1" or "2.5"').optional().describe('the owner\'s budget for the job in USDC, only if they named one'),
  }),
  outputSchema: z.object({
    status: z.enum(['quoted', 'unavailable', 'not_taking_calls', 'not_found', 'no_payments']),
    handle: z.string(),
    plan: z.object({ name: z.string(), priceUsd: z.string() }).optional(),
    price: z.object({ usdc: z.string(), network: z.string(), payTo: z.string() }).optional(),
    windowSeconds: z.number().optional().describe('how long the agent has to deliver once paid'),
    withinBudget: z.boolean().optional().describe('with maxUsdc: whether the quoted price is at or under the owner\'s budget'),
    reason: z.string().optional(),
    canPayHere: z.literal(false),
    note: z.string(),
  }),
  execute: async ({ handle, agentId, task, maxUsdc }) => {
    if (task.includes('{{secrets.')) throw new Error('a task for an outside agent must not carry secrets')
    const base = { handle, canPayHere: false as const, note: NOT_HIRED }
    const plan = await defaultPlan(agentId).catch(() => undefined)
    const planOut = plan?.price_amount ? { plan: { name: plan.display_name ?? '', priceUsd: plan.price_amount } } : {}
    const res = await fetch(`${agentBase(handle)}/a2a/v1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // No X-PAYMENT header: the market answers with the price and starts nothing.
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: { message: { messageId: randomUUID(), role: 'ROLE_USER', parts: [{ text: task }] }, configuration: { historyLength: 0 } } }),
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    })
    const body = (await res.json().catch(() => ({}))) as { accepts?: Accept[]; error?: unknown }
    if (res.status === 404) return { status: 'not_found' as const, ...base, reason: 'no published agent with this handle' }
    if (res.status === 402) {
      const row = (body.accepts ?? []).find((a) => a.network?.startsWith('near:') && /^\d+$/.test(a.amount ?? ''))
      if (!row) return { status: 'no_payments' as const, ...base, ...planOut, reason: 'the market takes no payment for this agent on NEAR yet' }
      return {
        status: 'quoted' as const, ...base, ...planOut,
        // USDC has 6 decimals; the amount is in its smallest unit.
        price: { usdc: fromUnits(BigInt(row.amount!), 6), network: row.network!, payTo: row.payTo ?? '' },
        // The budget is compared here in USDC's smallest unit, not by the model (the haggle taught us, 13 Nov).
        ...(maxUsdc ? { withinBudget: BigInt(row.amount!) <= toUnits(maxUsdc, 6) } : {}),
        // The market adds 10 minutes to the agent's window for the payment to stay valid.
        ...(row.maxTimeoutSeconds ? { windowSeconds: Math.max(0, row.maxTimeoutSeconds - 600) } : {}),
      }
    }
    const code = (body.error as { code?: number } | undefined)?.code
    if (code === -32603) return { status: 'unavailable' as const, ...base, ...planOut, reason: 'the agent cannot be reached right now; try again in a few minutes or pick another' }
    if (code === -32004) return { status: 'not_taking_calls' as const, ...base, ...planOut, reason: 'the agent is not taking jobs or has no price' }
    throw new Error(`Agent Market: ${code ? `JSON-RPC ${code}` : `HTTP ${res.status}`}`)
  },
})
