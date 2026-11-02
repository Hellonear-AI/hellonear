// Tool registry. A tool's key in the agent's `tools` object is what Mastra reports as
// `payload.toolName`, so every tool is registered under a key equal to its id (spike #5).
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { SECRETS_KEY, assertHostAllowed, assertPublicHttpsUrl, assertResolvesPublic, fillSecrets, redact, type Secret } from './secrets.ts'

const getTime = createTool({
  id: 'get_time',
  description: 'Get the current time in UTC as an ISO 8601 string.',
  inputSchema: z.object({}),
  outputSchema: z.object({ utc: z.string() }),
  execute: async () => ({ utc: new Date().toISOString() }),
})

const addNumbers = createTool({
  id: 'add_numbers',
  description: 'Add two numbers and return the sum.',
  inputSchema: z.object({ a: z.number(), b: z.number() }),
  outputSchema: z.object({ sum: z.number() }),
  execute: async ({ a, b }) => ({ sum: a + b }),
})

// Stand-in for a wallet action until the OutLayer tools land (#13, #14). Moves no money.
const demoTransfer = createTool({
  id: 'demo_transfer',
  description: 'Send a payment to a recipient. Always requires the owner to approve.',
  inputSchema: z.object({ to: z.string(), amountUsdc: z.number().positive() }),
  outputSchema: z.object({ status: z.literal('simulated'), to: z.string(), amountUsdc: z.number() }),
  requireApproval: true,
  execute: async ({ to, amountUsdc }) => ({ status: 'simulated' as const, to, amountUsdc }),
})

// Generic HTTPS call that can use the owner's secrets as {{secrets.NAME}} (#18).
// Secrets are filled in here, never shown to the model, and redacted from what it reads back.
const httpRequest = createTool({
  id: 'http_request',
  description: 'Call a public HTTPS API. Put credentials only as {{secrets.NAME}} placeholders in the URL, headers or body; never ask for or type secret values.',
  inputSchema: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
  }),
  outputSchema: z.object({ status: z.number(), contentType: z.string(), body: z.string(), location: z.string().optional() }),
  execute: async ({ method, url, headers, body }, context) => {
    const secrets = (context?.requestContext?.get(SECRETS_KEY) as Map<string, Secret> | undefined) ?? new Map<string, Secret>()
    const used = new Set<string>()
    const target = assertPublicHttpsUrl(fillSecrets(url, secrets, used))
    const filledHeaders = Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k, fillSecrets(v, secrets, used)]))
    const filledBody = body === undefined ? undefined : fillSecrets(body, secrets, used)
    assertHostAllowed(target.hostname, used, secrets)
    await assertResolvesPublic(target.hostname)
    // Never follow redirects: they would resend the secrets to another host.
    const res = await fetch(target, { method, headers: filledHeaders, body: filledBody, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    const text = (await res.text()).slice(0, 4000)
    const values = [...secrets.values()].map((s) => s.value)
    return redact({ status: res.status, contentType: res.headers.get('content-type') ?? '', body: text, ...(res.headers.get('location') ? { location: res.headers.get('location')! } : {}) }, values)
  },
})

// Read-only NEAR account lookup on testnet (#20 "check balance"). Public RPC, no keys, moves nothing.
const NEAR_RPC_URL = process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.near.org'
const YOCTO_PER_NEAR = 10n ** 24n
const nearViewAccount = createTool({
  id: 'near_view_account',
  description: 'Look up a NEAR testnet account: its available balance in NEAR and storage used. Read-only.',
  inputSchema: z.object({ accountId: z.string().min(2).max(64).regex(/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/, 'not a valid NEAR account id') }),
  outputSchema: z.object({ accountId: z.string(), balanceNear: z.number(), amountYocto: z.string(), storageUsage: z.number() }),
  execute: async ({ accountId }) => {
    const res = await fetch(NEAR_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'engine', method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: accountId } }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await res.json()) as { result?: { amount: string; storage_usage: number }; error?: { cause?: { name?: string }; message?: string } }
    if (!body.result) throw new Error(`NEAR RPC: ${body.error?.cause?.name ?? body.error?.message ?? `HTTP ${res.status}`}`)
    const yocto = BigInt(body.result.amount)
    // Exact amount as a string; a number in NEAR (4 decimals) for display and comparisons.
    const balanceNear = Number(yocto / 10n ** 20n) / 10_000
    return { accountId, balanceNear, amountYocto: body.result.amount, storageUsage: body.result.storage_usage }
  },
})

export const toolRegistry = { get_time: getTime, add_numbers: addNumbers, demo_transfer: demoTransfer, http_request: httpRequest, near_view_account: nearViewAccount } as const
export type ToolKey = keyof typeof toolRegistry

// Tools every Mind has, plus the tools of its equipped skills. Unknown keys are ignored.
export function toolsFor(skillToolKeys: string[]) {
  const keys = new Set<string>(['get_time', ...skillToolKeys])
  return Object.fromEntries([...keys].filter((k): k is ToolKey => k in toolRegistry).map((k) => [k, toolRegistry[k]]))
}
