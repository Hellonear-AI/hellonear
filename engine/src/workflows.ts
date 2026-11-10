// Saved Visual Builder workflows (#20): compile, register live, persist in Postgres
// (Mastra's workflowDefinitions store), list, load for the editor and delete.
import { compileCanvas, mastraWorkflowId, wayWorkflowId, type Canvas, type CompiledWorkflow } from './builder.ts'
import { deleteAutopilot, syncAutopilot } from './autopilot.ts'
import { mastra, storage } from './mastra.ts'

type Meta = { v: 1; mindId: string; workflowId: string; canvas: Canvas; tools: string[]; steps: CompiledWorkflow['steps']; schedule: { cron: string; timezone?: string } | null }
type StoredDefinition = { id: string; metadata?: { hellonear?: Meta }; updatedAt?: Date | string }

const store = async () => {
  const s = await storage.getStore('workflowDefinitions')
  if (!s) throw new Error('storage has no workflowDefinitions domain')
  return s as unknown as {
    get(id: string): Promise<StoredDefinition | null>
    list(args?: { status?: string }): Promise<{ definitions: StoredDefinition[] }>
    delete(id: string): Promise<void>
  }
}

const summary = (d: StoredDefinition) => {
  const m = d.metadata!.hellonear!
  return { workflowId: m.workflowId, name: m.canvas.name, tools: m.tools, schedule: m.schedule, updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null }
}

// Replaces any earlier version: new runs use the new graph, running ones keep theirs.
export async function saveWorkflow(mindId: string, workflowId: string, canvas: unknown) {
  const compiled = compileCanvas(mindId, workflowId, canvas)
  // Multi-step If ways (#153) are nested workflows: register them first, and drop a way that is no longer one.
  for (const child of compiled.children) await mastra.addDynamicWorkflow(child as never)
  await mastra.addDynamicWorkflow(compiled.definition as never)
  await removeWays(mindId, workflowId, new Set(compiled.children.map((c) => c.id)))
  const meta = (compiled.definition.metadata as { hellonear: Meta }).hellonear
  // An Autopilot schedule follows the new cron, or pauses if the new canvas cannot run unattended.
  const autopilot = await syncAutopilot(mindId, workflowId, meta)
  return { workflowId, tools: compiled.tools, steps: compiled.steps, schedule: meta.schedule, autopilot }
}

export async function loadWorkflow(mindId: string, workflowId: string) {
  const d = await (await store()).get(mastraWorkflowId(mindId, workflowId))
  // The metadata check keeps one Mind from reading another's workflow even if ids were forged.
  if (!d?.metadata?.hellonear || d.metadata.hellonear.mindId !== mindId) return null
  return { ...summary(d), canvas: d.metadata.hellonear.canvas, steps: d.metadata.hellonear.steps }
}

export async function listWorkflows(mindId: string) {
  const prefix = mastraWorkflowId(mindId, '')
  const { definitions } = await (await store()).list()
  return definitions.filter((d) => d.id.startsWith(prefix) && d.metadata?.hellonear?.mindId === mindId).map(summary)
}

async function removeWays(mindId: string, workflowId: string, keep = new Set<string>()) {
  for (const handle of ['then', 'else'] as const) {
    const id = wayWorkflowId(mindId, workflowId, handle)
    if (keep.has(id) || !(await (await store()).get(id))) continue
    await (await store()).delete(id)
    try { mastra.removeWorkflow(id) } catch { /* not registered in this process */ }
  }
}

export async function deleteWorkflow(mindId: string, workflowId: string): Promise<boolean> {
  if (!(await loadWorkflow(mindId, workflowId))) return false
  const id = mastraWorkflowId(mindId, workflowId)
  await deleteAutopilot(mindId, workflowId)
  await (await store()).delete(id)
  mastra.removeWorkflow(id)
  await removeWays(mindId, workflowId)
  return true
}
