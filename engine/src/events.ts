// Normalizes Mastra stream chunks into HelloNear events (docs/api-contract.md §3).
// The UI and Mind Graph depend on these, never on raw Mastra chunks.
import { builderNodeId, nodeIdFor, type BuilderStep } from './graph.ts'
import { plainDashes } from './mind.ts'
import { priceOf } from './models.ts'
import { redact } from './secrets.ts'
import type { Verification } from './verify.ts'
import { HARD_STOPS } from './wallet.ts'
import { isMailRefusal } from './mail.ts'

export type HelloNearEvent = { v: 1; type: string; runId: string; mindId: string; seq: number; ts: string } & Record<string, unknown>
type Usage = { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; totalTokens?: number }


const pickUsage = (u: Usage | undefined) =>
  u ? { inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0, reasoningTokens: u.reasoningTokens ?? 0, totalTokens: u.totalTokens ?? 0 } : undefined

export function createNormalizer(opts: { mindId: string; threadId: string; model: string; skills?: string[]; secretValues?: string[]; startSeq?: number }) {
  let seq = opts.startSeq ?? 0
  let step = 0
  let text = ''
  const completionIds: string[] = []
  // Second line of defence: tools already redact their results, but nothing an event carries may hold a secret value.
  const emit = (runId: string, type: string, extra: Record<string, unknown> = {}): HelloNearEvent =>
    redact({ v: 1, type, runId, mindId: opts.mindId, seq: seq++, ts: new Date().toISOString(), ...extra }, opts.secretValues ?? [])

  // Returns the events for one chunk (usually zero or one).
  const normalize = async function normalize(chunk: { type: string; runId: string; payload?: any }): Promise<HelloNearEvent[]> {
    const p = chunk.payload ?? {}
    const tool = p.toolName as string | undefined
    switch (chunk.type) {
      case 'start':
        return [emit(chunk.runId, 'run.started', { threadId: opts.threadId, model: opts.model, nodeId: `model:${opts.model}`, skills: opts.skills ?? [] })]
      case 'step-start':
        return [emit(chunk.runId, 'step.started', { step: ++step })]
      case 'reasoning-delta':
        return p.text ? [emit(chunk.runId, 'reasoning.delta', { text: p.text })] : []
      case 'text-delta': {
        // House style (Axel, 9 Nov): no em or en dashes in what the owner reads. The prompt asks for it (#109), but
        // a model still copies them from real calendars and inboxes (#124), so the reply text is normalised here.
        // Display only: the TEE verification covers the model's own completion bytes.
        const t = plainDashes(p.text ?? '')
        text += t
        return t ? [emit(chunk.runId, 'text.delta', { text: t })] : []
      }
      case 'tool-call':
        return [emit(chunk.runId, 'tool.called', { toolCallId: p.toolCallId, tool, nodeId: nodeIdFor(opts.mindId, tool!, p.args), args: p.args })]
      case 'tool-result':
        // The wallet refused before signing (#42), or a send was refused (#96): a hard stop, red in the Mind Graph,
        // never with a tx link or a message id.
        if (HARD_STOPS.has(p.result?.status) || isMailRefusal(tool, p.result)) {
          return [emit(chunk.runId, 'tool.error', { toolCallId: p.toolCallId, tool, nodeId: nodeIdFor(opts.mindId, tool!, p.args), status: p.result.status, error: String(p.result.message ?? p.result.status), result: p.result })]
        }
        return [emit(chunk.runId, 'tool.result', { toolCallId: p.toolCallId, tool, nodeId: nodeIdFor(opts.mindId, tool!, p.args), result: p.result, status: 'ok' })]
      case 'tool-error':
        return [emit(chunk.runId, 'tool.error', { toolCallId: p.toolCallId, tool, nodeId: nodeIdFor(opts.mindId, tool!, p.args), status: 'error', error: String(p.error) })]
      case 'tool-call-approval':
        return [emit(chunk.runId, 'tool.approval_required', { toolCallId: p.toolCallId, tool, nodeId: nodeIdFor(opts.mindId, tool!, p.args), args: p.args })]
      case 'step-finish':
        if (typeof p.metadata?.id === 'string') completionIds.push(p.metadata.id)
        return [emit(chunk.runId, 'step.finished', { step, usage: pickUsage(p.output?.usage) })]
      case 'finish': {
        const usage = pickUsage(p.output?.usage)
        const price = await priceOf(opts.model)
        const costUsd = usage && price ? usage.inputTokens * price.input + usage.outputTokens * price.output : null
        return [emit(chunk.runId, 'run.finished', { finishReason: p.stepResult?.reason, text, usage, costUsd, verification: { status: 'pending' } })]
      }
      case 'error':
        return [emit(chunk.runId, 'run.error', { error: String(p.error ?? 'unknown error') })]
      default:
        return []
    }
  }
  return Object.assign(normalize, {
    event: emit,
    text: () => text,
    completionIds: () => [...completionIds],
    // Emits the run's last event: the badge result, after the stream has been fully read.
    verified: (runId: string, verification: Verification) => emit(runId, 'run.verified', { nodeId: `model:${opts.model}`, model: opts.model, verification }),
  })
}

// Workflow runs from the Visual Builder (#20). Workflow chunks become node.* events for the
// canvas and the Mind Graph; chunks from inside an agent step go through the chat normalizer,
// so tool calls, text and the badge work exactly as in chat.
export function createWorkflowNormalizer(opts: { mindId: string; workflowId: string; model: string; skills: string[]; secretValues: string[]; steps: Record<string, BuilderStep> }) {
  const inner = createNormalizer({ mindId: opts.mindId, threadId: '', model: opts.model, skills: opts.skills, secretValues: opts.secretValues })
  const node = (s: BuilderStep) => ({ node: s.node, nodeType: s.type, nodeId: builderNodeId(opts.mindId, s) })

  const normalize = async function normalize(chunk: { type: string; runId: string; payload?: any }): Promise<HelloNearEvent[]> {
    const p = chunk.payload ?? {}
    const step = typeof p.id === 'string' ? opts.steps[p.id] : undefined
    switch (chunk.type) {
      case 'workflow-start':
        return [inner.event(chunk.runId, 'workflow.started', { workflowId: opts.workflowId, nodeId: `workflow:${opts.workflowId}`, model: opts.model, skills: opts.skills })]
      // Mapping steps (in:<node>) are internal and have no canvas node.
      case 'workflow-step-start':
        return step ? [inner.event(chunk.runId, 'node.started', node(step))] : []
      case 'workflow-step-result':
        if (!step) return []
        return [inner.event(chunk.runId, 'node.finished', { ...node(step), ...(p.status === 'success' ? { status: 'ok', output: p.output } : { status: 'error', error: String(p.error?.message ?? p.error ?? p.status) }) })]
      case 'workflow-step-output': {
        const c = p.output
        // The agent's own start/finish would look like a second run; node.* already frames it.
        if (!c?.type || c.type === 'start' || c.type === 'finish') return []
        return inner({ ...c, runId: chunk.runId })
      }
      case 'workflow-finish':
        return [inner.event(chunk.runId, 'workflow.finished', { workflowId: opts.workflowId, status: p.workflowStatus })]
      default:
        return []
    }
  }
  return Object.assign(normalize, {
    event: inner.event,
    completionIds: inner.completionIds,
    verified: inner.verified,
  })
}
