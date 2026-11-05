// Visual Builder workflows (#20) and Autopilot (#21). The engine stores the canvases and schedules; the
// backend checks ownership, adds the Mind config (and secrets for live runs), and keeps the Autopilot input
// so it can send the Mind config again whenever the Mind changes.
import { z } from 'zod'
import { query } from './db.ts'
import { engineJson } from './engine.ts'
import { mindConfig, type Mind } from './minds.ts'

export const workflowIdSchema = z.string().max(48).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase words joined by single dashes')
const inputSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({})
export const runWorkflowSchema = z.object({ input: inputSchema })
export const autopilotSchema = z.object({ input: inputSchema, enabled: z.boolean().default(true) })

const base = (mindId: string) => `/v1/minds/${encodeURIComponent(mindId)}/workflows`

export async function putAutopilot(userId: string, mind: Mind, workflowId: string, body: z.infer<typeof autopilotSchema>) {
  const out = await engineJson(`${base(mind.id)}/${workflowId}/autopilot`, { method: 'PUT', body: { userId, mind: mindConfig(mind), input: body.input, enabled: body.enabled } })
  // The engine keeps a schedule even when it answers 409 (it pauses it), so remember the input either way.
  if (out.status === 200 || out.status === 409) {
    await query(
      `insert into autopilots (mind_id, workflow_id, input, enabled) values ($1, $2, $3, $4)
       on conflict (mind_id, workflow_id) do update set input = excluded.input, enabled = excluded.enabled, updated_at = now()`,
      [mind.id, workflowId, body.input, body.enabled],
    )
  }
  return out
}

export async function deleteAutopilot(mindId: string, workflowId: string) {
  const out = await engineJson(`${base(mindId)}/${workflowId}/autopilot`, { method: 'DELETE' })
  if (out.status === 204 || out.status === 404) await query('delete from autopilots where mind_id = $1 and workflow_id = $2', [mindId, workflowId])
  return out
}

// After a Mind changes (persona, model, skills), every Autopilot schedule gets the new config. The engine
// pauses a schedule the new config cannot run; the result lists which ones and why, for the UI.
export async function syncAutopilots(userId: string, mind: Mind) {
  const rows = await query<{ workflow_id: string; input: Record<string, string | number | boolean>; enabled: boolean }>(
    'select workflow_id, input, enabled from autopilots where mind_id = $1', [mind.id],
  )
  const results = []
  for (const r of rows) {
    const out = await putAutopilot(userId, mind, r.workflow_id, { input: r.input, enabled: r.enabled })
    results.push({ workflowId: r.workflow_id, status: out.status, autopilot: out.body?.autopilot ?? null, issues: out.body?.issues })
  }
  return results
}

// Deleting a Mind deletes its workflows in the engine too (which removes their schedules), so no schedule
// keeps running a Mind that no longer exists.
export async function deleteAllWorkflows(mindId: string) {
  const { status, body } = await engineJson(base(mindId))
  if (status !== 200) return
  for (const w of body.workflows as { workflowId: string }[]) await engineJson(`${base(mindId)}/${w.workflowId}`, { method: 'DELETE' })
}

export const workflowPath = base
