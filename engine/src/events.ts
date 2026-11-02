// Normalizes Mastra stream chunks into HelloNear events (docs/api-contract.md §3).
// The UI and Mind Graph depend on these, never on raw Mastra chunks.
import { nodeIdFor } from './graph.ts'
import { priceOf } from './models.ts'

export type HelloNearEvent = { v: 1; type: string; runId: string; mindId: string; seq: number; ts: string } & Record<string, unknown>
type Usage = { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; totalTokens?: number }


const pickUsage = (u: Usage | undefined) =>
  u ? { inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0, reasoningTokens: u.reasoningTokens ?? 0, totalTokens: u.totalTokens ?? 0 } : undefined

export function createNormalizer(opts: { mindId: string; threadId: string; model: string; startSeq?: number }) {
  let seq = opts.startSeq ?? 0
  let step = 0
  let text = ''
  const emit = (runId: string, type: string, extra: Record<string, unknown> = {}): HelloNearEvent => ({ v: 1, type, runId, mindId: opts.mindId, seq: seq++, ts: new Date().toISOString(), ...extra })

  // Returns the events for one chunk (usually zero or one).
  return async function normalize(chunk: { type: string; runId: string; payload?: any }): Promise<HelloNearEvent[]> {
    const p = chunk.payload ?? {}
    const tool = p.toolName as string | undefined
    switch (chunk.type) {
      case 'start':
        return [emit(chunk.runId, 'run.started', { threadId: opts.threadId, model: opts.model, nodeId: `model:${opts.model}` })]
      case 'step-start':
        return [emit(chunk.runId, 'step.started', { step: ++step })]
      case 'reasoning-delta':
        return p.text ? [emit(chunk.runId, 'reasoning.delta', { text: p.text })] : []
      case 'text-delta':
        text += p.text ?? ''
        return p.text ? [emit(chunk.runId, 'text.delta', { text: p.text })] : []
      case 'tool-call':
        return [emit(chunk.runId, 'tool.called', { toolCallId: p.toolCallId, tool, nodeId: nodeIdFor(opts.mindId, tool!, p.args), args: p.args })]
      case 'tool-result':
        return [emit(chunk.runId, 'tool.result', { toolCallId: p.toolCallId, tool, nodeId: nodeIdFor(opts.mindId, tool!, p.args), result: p.result, status: 'ok' })]
      case 'tool-error':
        return [emit(chunk.runId, 'tool.error', { toolCallId: p.toolCallId, tool, nodeId: nodeIdFor(opts.mindId, tool!, p.args), status: 'error', error: String(p.error) })]
      case 'tool-call-approval':
        return [emit(chunk.runId, 'tool.approval_required', { toolCallId: p.toolCallId, tool, nodeId: nodeIdFor(opts.mindId, tool!, p.args), args: p.args })]
      case 'step-finish':
        return [emit(chunk.runId, 'step.finished', { step, usage: pickUsage(p.output?.usage) })]
      case 'finish': {
        const usage = pickUsage(p.output?.usage)
        const price = await priceOf(opts.model)
        const costUsd = usage && price ? usage.inputTokens * price.input + usage.outputTokens * price.output : null
        return [emit(chunk.runId, 'run.finished', { finishReason: p.stepResult?.reason, text, usage, costUsd, verification: { status: 'unverified', model: opts.model } })]
      }
      case 'error':
        return [emit(chunk.runId, 'run.error', { error: String(p.error ?? 'unknown error') })]
      default:
        return []
    }
  }
}
