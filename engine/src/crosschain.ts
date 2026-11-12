// Cross-chain quote (NEAR Intents, 1Click API): what a stablecoin payment from NEAR to another chain would deliver, as a
// preview only. NEAR Intents has no testnet (docs.near-intents.org FAQ, read 12 Nov; HACKATHON.md Q-007 says use
// `dry: true` quotes), and every HelloNear wallet is on testnet, so this tool never gets a deposit address and nothing
// can be sent with it. `dry: true` needs no API key (checked live 12 Nov: 201, 10 USDC on NEAR to Base quoted in ~1 s).
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { walletCall } from './wallet.ts'

// Read per call, not at import, so tests can point it at a fake.
const oneClick = () => process.env.ONECLICK_URL ?? 'https://1click.chaindefuser.com'

export const STABLECOINS = ['USDC', 'USDT'] as const

// Names people use for a chain, to 1Click's `blockchain` ids (GET /v0/tokens, 12 Nov). An id itself also works.
const CHAIN_NAMES: Record<string, string> = {
  ethereum: 'eth', arbitrum: 'arb', solana: 'sol', polygon: 'pol', bnb: 'bsc', 'bnb chain': 'bsc', binance: 'bsc', optimism: 'op',
  avalanche: 'avax', tron: 'tron', ton: 'ton', base: 'base', near: 'near', stellar: 'stellar', aptos: 'aptos', sui: 'sui', gnosis: 'gnosis',
  scroll: 'scroll', monad: 'monad', 'x layer': 'xlayer', xlayer: 'xlayer', hyperliquid: 'hypercore',
}
export const chainId = (name: string) => { const n = name.trim().toLowerCase(); return CHAIN_NAMES[n] ?? n }

export type Token = { assetId: string; decimals: number; blockchain: string; symbol: string }

// The token list changes rarely; one fetch per 10 minutes is enough.
let cached: { at: number; tokens: Token[] } | undefined
export const resetTokenCache = () => { cached = undefined }
async function tokens(): Promise<Token[]> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.tokens
  const res = await fetch(`${oneClick()}/v0/tokens`, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`NEAR Intents: token list HTTP ${res.status}`)
  const list = (await res.json()) as Token[]
  cached = { at: Date.now(), tokens: list }
  return list
}

// One token per chain and symbol. Hyperliquid lists USDC twice (hip1 and erc20); the first listed is used.
export function findToken(list: Token[], symbol: string, chain: string): Token | undefined {
  return list.find((t) => t.symbol === symbol && t.blockchain === chain)
}
export const chainsFor = (list: Token[], symbol: string) => [...new Set(list.filter((t) => t.symbol === symbol && t.blockchain !== 'near').map((t) => t.blockchain))].sort()

// Decimal text and smallest units, in BigInt so no float ever touches an amount.
export function toUnits(amount: string, decimals: number): bigint {
  const [w, f = ''] = amount.split('.')
  if (f.length > decimals) throw new Error(`at most ${decimals} decimals`)
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, '0') || '0')
}
export function fromUnits(units: bigint, decimals: number): string {
  const neg = units < 0n
  const v = neg ? -units : units
  const base = 10n ** BigInt(decimals)
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${neg ? '-' : ''}${v / base}${frac ? `.${frac}` : ''}`
}
// What the route keeps, in the token's own unit: sent minus received, both scaled to the larger decimals.
export function costOf(amountIn: bigint, dIn: number, amountOut: bigint, dOut: number): string {
  const d = Math.max(dIn, dOut)
  return fromUnits(amountIn * 10n ** BigInt(d - dIn) - amountOut * 10n ** BigInt(d - dOut), d)
}

export const NOT_SENT = 'Preview only: nothing was sent. NEAR Intents runs on NEAR mainnet only and this Mind\'s wallet is on testnet, so it cannot send this payment yet.'

type QuoteAnswer = {
  quote?: { amountIn: string; amountOut: string; minAmountOut?: string; timeEstimate?: number }
  correlationId?: string
  timestamp?: string
  message?: string
}

export const crosschainQuote = createTool({
  id: 'crosschain_quote',
  description: 'Preview a stablecoin payment from NEAR to another chain through NEAR Intents: how much the recipient would get, the cost and the time. A quote only: it sends nothing and asks no approval, and this Mind cannot send cross-chain yet (NEAR Intents is mainnet only, the wallet is testnet). The recipient address must be one the owner typed in this conversation.',
  inputSchema: z.object({
    token: z.enum(STABLECOINS).describe('the stablecoin on NEAR to send'),
    amount: z.string().regex(/^\d{1,9}(\.\d{1,6})?$/, 'a decimal amount, e.g. "10" or "2.5"').describe('how much of it to send'),
    toChain: z.string().min(2).max(20).describe('the chain to deliver on, e.g. "base", "arbitrum", "solana", "ethereum", "polygon", "tron"'),
    recipient: z.string().min(20).max(100).describe('the recipient\'s address on that chain, exactly as the owner gave it'),
    toToken: z.enum(STABLECOINS).optional().describe('the stablecoin to deliver; the same as token when left out'),
  }),
  outputSchema: z.object({
    status: z.literal('quote_only'),
    from: z.object({ chain: z.literal('near'), token: z.string(), amount: z.string() }),
    to: z.object({ chain: z.string(), token: z.string(), recipient: z.string(), amount: z.string(), minAmount: z.string() }),
    cost: z.string().describe('sent minus received, in the token'),
    seconds: z.number().describe('NEAR Intents\' estimate of the time it takes'),
    quoteId: z.string(),
    quotedAt: z.string(),
    note: z.string(),
  }),
  execute: async ({ token, amount, toChain, recipient, toToken }, context) => {
    const out = toToken ?? token
    const chain = chainId(toChain)
    if (chain === 'near') throw new Error('this is for other chains; a payment on NEAR uses send_payment')
    const list = await tokens()
    const from = findToken(list, token, 'near')
    const to = findToken(list, out, chain)
    if (!from) throw new Error(`NEAR Intents lists no ${token} on NEAR`)
    if (!to) throw new Error(`NEAR Intents lists no ${out} on "${toChain}". ${out} goes to: ${chainsFor(list, out).join(', ')}`)
    const amountIn = toUnits(amount, from.decimals)
    if (amountIn <= 0n) throw new Error('the amount must be more than 0')
    // Refunds would go back to this Mind's own wallet. A dry quote moves nothing, but 1Click requires the field.
    const { address } = await walletCall<{ address: string }>(context, 'GET', '/internal/v1/wallet/balance')
    const res = await fetch(`${oneClick()}/v0/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100,
        originAsset: from.assetId, destinationAsset: to.assetId, amount: amountIn.toString(),
        depositType: 'ORIGIN_CHAIN', recipient, recipientType: 'DESTINATION_CHAIN', refundTo: address, refundType: 'ORIGIN_CHAIN',
        deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    })
    const body = (await res.json().catch(() => ({}))) as QuoteAnswer
    // 1Click's own words for a refusal ("recipient is not valid", an amount below the minimum) are safe to pass on.
    if (!res.ok || !body.quote) throw new Error(`NEAR Intents: ${body.message ?? `HTTP ${res.status}`}`)
    const q = body.quote
    const got = BigInt(q.amountOut)
    return {
      status: 'quote_only' as const,
      from: { chain: 'near' as const, token, amount: fromUnits(amountIn, from.decimals) },
      to: { chain, token: out, recipient, amount: fromUnits(got, to.decimals), minAmount: fromUnits(BigInt(q.minAmountOut ?? q.amountOut), to.decimals) },
      cost: costOf(amountIn, from.decimals, got, to.decimals),
      seconds: q.timeEstimate ?? 0,
      quoteId: body.correlationId ?? '',
      quotedAt: body.timestamp ?? new Date().toISOString(),
      note: NOT_SENT,
    }
  },
})
