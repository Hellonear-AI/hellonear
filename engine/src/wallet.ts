// Payment tools reach the Mind's wallet through the backend (#42, option B): the backend holds the
// OutLayer key, the engine only gets a run-scoped wallet token (docs/api-contract.md §2 "Payment tools").
import { z } from 'zod'

// The token lives in RequestContext as a Map, like secrets: run snapshots store the requestContext,
// and a Map serializes to {} (spike 03), so the token never lands in the mastra tables.
export const WALLET_KEY = 'wallet'
export const walletContext = (token: string | undefined) => new Map(token ? [['token', token]] : [])

// A payment that failed with an error is remembered in the same per-request Map (not in run snapshots), so the
// rest of that request sends no other payment (tools.ts send_payment). beforeApproval sees a plain object view of
// the request context whose values are the same Map.
export function markPaymentFailed(context: Ctx) {
  (context?.requestContext?.get(WALLET_KEY) as Map<string, string> | undefined)?.set('failed', '1')
}
export const paymentFailedEarlier = (view: Record<string, unknown> | undefined) =>
  (view?.[WALLET_KEY] as Map<string, string> | undefined)?.get('failed') === '1'

export const walletTokenSchema =z.string().regex(/^wt_[A-Za-z0-9._~-]+$/, 'not a wallet token').max(2048)

type Ctx = { requestContext?: { get: (key: string) => unknown } } | undefined

export class NoWalletError extends Error {
  constructor() { super('this Mind has no wallet yet: the owner can create one on the Mind\'s wallet screen') }
}

// Calls one of the backend's internal wallet routes with the engine key and the run's wallet token.
// `accept`: statuses that are answers, not errors (paid data's 402 and 409, #150); the JSON body comes back with `httpStatus`.
export async function walletCall<T>(context: Ctx, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, accept: number[] = []): Promise<T> {
  const token = (context?.requestContext?.get(WALLET_KEY) as Map<string, string> | undefined)?.get('token')
  if (!token) throw new NoWalletError()
  // Read per call, not at import: unit tests load the tools without the engine's config.
  const base = process.env.BACKEND_URL
  if (!base) throw new Error('BACKEND_URL is not set (see engine/.env.example)')
  const res = await fetch(new URL(path, base), {
    method,
    headers: { 'x-engine-key': process.env.ENGINE_API_KEY ?? '', 'x-wallet-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (accept.includes(res.status)) return { ...json, httpStatus: res.status } as T
  if (!res.ok) throw new Error(`wallet: ${res.status} ${String(json.error ?? 'error')}`)
  return json as T
}

// Refusals OutLayer gives before signing: there is no transaction, so never show a tx link for them.
export const HARD_STOPS = new Set(['policy_denied', 'wallet_frozen'])
