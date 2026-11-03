// Autopilot (#21): a saved builder workflow runs on its trigger's cron with nobody watching,
// through Mastra workflow schedules (spike 03), and every run shows up in the run history.
import { z } from 'zod'
import { mastraWorkflowId, type Canvas } from './builder.ts'
import { builderNodeId, type BuilderStep } from './graph.ts'
import { MIND_KEY, UNATTENDED_KEY, mastra, storage } from './mastra.ts'
import { mindSchema, type Mind } from './mind.ts'
import { missingTools } from './skills.ts'

export const autopilotSchema = z.object({
  userId: z.string().min(1),
  mind: mindSchema,
  input: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  enabled: z.boolean().default(true),
})
export type AutopilotRequest = z.infer<typeof autopilotSchema>

type Saved = { canvas: Canvas; tools: string[]; schedule: { cron: string; timezone?: string } | null; steps: Record<string, BuilderStep> }
type Issue = { code: 'no_schedule' | 'uses_secrets' | 'missing_tools' | 'invalid_input' | 'invalid_schedule'; message: string; tools?: string[] }
type Schedule = NonNullable<Awaited<ReturnType<typeof mastra.schedules.get>>> & { inputData?: unknown; requestContext?: Record<string, unknown> }

// Why this workflow cannot run unattended for this Mind, if it cannot.
function problems(saved: Saved, mind: Mind, input: Record<string, unknown>): Issue[] {
  const issues: Issue[] = []
  if (!saved.schedule) issues.push({ code: 'no_schedule', message: 'the trigger has no schedule' })
  // A schedule's requestContext is stored as plain JSON (spike 03), so secrets can never go there.
  if (/\{\{\s*secrets\./.test(JSON.stringify(saved.canvas))) issues.push({ code: 'uses_secrets', message: 'Autopilot cannot use {{secrets.…}} yet' })
  const missing = missingTools(mind.skills.map((s) => s.skillId), saved.tools)
  if (missing.length) issues.push({ code: 'missing_tools', message: 'the Mind does not equip every tool this workflow uses', tools: missing })
  const trigger = saved.canvas.nodes.find((n) => n.type === 'trigger')
  for (const want of trigger?.type === 'trigger' ? trigger.data.inputs : []) {
    if (typeof input[want.name] !== want.type) issues.push({ code: 'invalid_input', message: `input "${want.name}" must be a ${want.type}` })
  }
  return issues
}

// One schedule per workflow; listing by workflow id avoids guessing Mastra's id normalization.
async function scheduleOf(mindId: string, workflowId: string): Promise<Schedule | null> {
  const [s] = await mastra.schedules.list({ workflowId: mastraWorkflowId(mindId, workflowId) })
  return (s as Schedule | undefined) ?? null
}

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null)
function view(s: Schedule) {
  const meta = (s.metadata?.hellonear ?? {}) as { pausedFor?: Issue[] }
  return {
    status: s.status, cron: s.cron, timezone: s.timezone ?? null,
    nextFireAt: s.status === 'active' ? iso(s.nextFireAt) : null, lastFireAt: iso(s.lastFireAt), lastRunId: s.lastRunId ?? null,
    pausedFor: s.status === 'paused' ? meta.pausedFor ?? [] : [],
  }
}
export type AutopilotView = ReturnType<typeof view>

const metadata = (mindId: string, workflowId: string, pausedFor: Issue[] = []) => ({ hellonear: { v: 1, mindId, workflowId, pausedFor } })
// Also when already paused, so the UI can say why it cannot be turned on again.
const pauseFor = async (s: Schedule, mindId: string, workflowId: string, issues: Issue[]) =>
  view((await mastra.schedules.update(s.id, { status: 'paused', metadata: metadata(mindId, workflowId, issues) })) as Schedule)

// Turns Autopilot on (or off with enabled: false) with a copy of the Mind config.
// The backend sends it again whenever the Mind changes. If the Mind can no longer run
// the workflow, an existing schedule is paused rather than left running the old config.
export async function setAutopilot(mindId: string, workflowId: string, saved: Saved, req: AutopilotRequest): Promise<{ autopilot: AutopilotView } | { issues: Issue[]; autopilot: AutopilotView | null }> {
  const existing = await scheduleOf(mindId, workflowId)
  const issues = problems(saved, req.mind, req.input)
  if (issues.length) return { issues, autopilot: existing ? await pauseFor(existing, mindId, workflowId, issues) : null }
  const fields = {
    cron: saved.schedule!.cron,
    // Explicit, so fire times never depend on where the engine runs.
    timezone: saved.schedule!.timezone ?? 'UTC',
    inputData: req.input,
    // Never secrets here (see problems()). Unattended: agent steps get no approval tools.
    requestContext: { [MIND_KEY]: req.mind, [UNATTENDED_KEY]: true },
    resourceId: req.userId,
    metadata: metadata(mindId, workflowId),
    status: req.enabled ? ('active' as const) : ('paused' as const),
  }
  try {
    const s = existing ? await mastra.schedules.update(existing.id, fields) : await mastra.schedules.create({ workflowId: mastraWorkflowId(mindId, workflowId), ...fields })
    return { autopilot: view(s as Schedule) }
  } catch (e) {
    // Mastra validates the cron and timezone.
    return { issues: [{ code: 'invalid_schedule', message: e instanceof Error ? e.message : String(e) }], autopilot: existing ? view(existing) : null }
  }
}

export async function getAutopilot(mindId: string, workflowId: string) {
  const s = await scheduleOf(mindId, workflowId)
  return s ? view(s) : null
}

export async function deleteAutopilot(mindId: string, workflowId: string): Promise<boolean> {
  const s = await scheduleOf(mindId, workflowId)
  if (s) await mastra.schedules.delete(s.id)
  return !!s
}

// After the canvas is saved again: follow its new cron, or pause if the new canvas cannot run unattended.
export async function syncAutopilot(mindId: string, workflowId: string, saved: Saved) {
  const s = await scheduleOf(mindId, workflowId)
  if (!s) return null
  const mind = mindSchema.safeParse(s.requestContext?.[MIND_KEY])
  const issues = mind.success ? problems(saved, mind.data, (s.inputData ?? {}) as Record<string, unknown>) : [{ code: 'invalid_input' as const, message: 'stored Mind config is invalid' }]
  if (issues.length) return pauseFor(s, mindId, workflowId, issues)
  try {
    return view((await mastra.schedules.update(s.id, { cron: saved.schedule!.cron, timezone: saved.schedule!.timezone ?? 'UTC' })) as Schedule)
  } catch (e) {
    return pauseFor(s, mindId, workflowId, [{ code: 'invalid_schedule', message: e instanceof Error ? e.message : String(e) }])
  }
}

type StepResult = { status?: string; output?: unknown; error?: unknown; startedAt?: number; endedAt?: number }
type Snapshot = { status?: string; context?: Record<string, StepResult> }

// Every run of a workflow, newest first, from Mastra's run snapshots: what actually ran,
// since a schedule trigger only records that a fire was dispatched (spike 03).
export async function listRuns(mindId: string, workflowId: string, steps: Record<string, BuilderStep>, limit: number) {
  const wf = await storage.getStore('workflows')
  if (!wf) throw new Error('storage has no workflows domain')
  const { runs } = await wf.listWorkflowRuns({ workflowName: mastraWorkflowId(mindId, workflowId), perPage: limit, page: 0 })
  return runs.map((r) => {
    const snap = (typeof r.snapshot === 'string' ? JSON.parse(r.snapshot) : r.snapshot) as Snapshot
    // In the order they ran, which is not the order of the steps map.
    const ran = Object.entries(steps).filter(([id]) => snap.context?.[id]?.status).sort(([a], [b]) => (snap.context![a].startedAt ?? 0) - (snap.context![b].startedAt ?? 0))
    const nodes = ran.map(([id, step]) => {
      const res = snap.context![id]
      const outcome = res.status === 'success' ? { status: 'ok', output: res.output } : res.status === 'failed' ? { status: 'error', error: String((res.error as { message?: string })?.message ?? res.error) } : { status: res.status }
      return { node: step.node, nodeType: step.type, nodeId: builderNodeId(mindId, step), ...outcome, startedAt: iso(res.startedAt), endedAt: iso(res.endedAt) }
    })
    // Scheduled fires (cron or "fire now") get run ids sched_<scheduleId>_<ts>.
    return { runId: r.runId, trigger: r.runId.startsWith('sched_') ? 'autopilot' : 'manual', status: snap.status ?? 'unknown', startedAt: new Date(r.createdAt).toISOString(), updatedAt: new Date(r.updatedAt).toISOString(), nodes }
  })
}
