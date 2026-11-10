import { api } from "@/lib/api"
import { ownerTimeZone, stream } from "@/modules/chat/api"
import type { RunEvent } from "@/modules/chat/data/events"

// Workflows and Autopilot (#20, #21): docs/api-contract.md §2 "Visual Builder workflows" and
// "Autopilot", proxied by the backend under /minds/{mindId}/workflows (§7). The backend adds the
// Mind's config, so the browser sends only the canvas, `input` and `enabled`.

export type Schedule = { cron: string; timezone?: string }

export type CanvasNode =
  | { id: string; type: "trigger"; position: { x: number; y: number }; data: { schedule?: Schedule; inputs?: { name: string; type: string }[] } }
  | { id: string; type: "agent"; position: { x: number; y: number }; data: { prompt: string } }
  | { id: string; type: "tool"; position: { x: number; y: number }; data: { tool: string; args: Record<string, unknown> } }
  | { id: string; type: "http"; position: { x: number; y: number }; data: { method: string; url: string; headers?: Record<string, string>; body?: string } }
  | { id: string; type: "condition"; position: { x: number; y: number }; data: { left: string; op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"; right: unknown } }

export type Canvas = { name: string; nodes: CanvasNode[]; edges: { source: string; target: string; sourceHandle?: "then" | "else" }[] }

export type AutopilotIssue = { code: string; message: string; tools?: string[] }

export type Autopilot = {
  status: "active" | "paused"
  cron: string
  timezone: string | null
  nextFireAt: string | null
  lastFireAt: string | null
  lastRunId: string | null
  pausedFor: AutopilotIssue[]
}

export type ApiWorkflow = { workflowId: string; name: string; tools: string[]; schedule: Schedule | null; updatedAt: string }
export type ApiWorkflowDetail = ApiWorkflow & { canvas: Canvas }

export type WorkflowRunNode = { node: string; nodeType: string; nodeId: string; status: string; output?: unknown; error?: string; startedAt?: string; endedAt?: string }
export type WorkflowRun = { runId: string; trigger: "autopilot" | "manual"; status: string; startedAt: string; updatedAt: string; nodes: WorkflowRunNode[] }

const enc = encodeURIComponent
const base = (mindId: string, workflowId?: string) => `/minds/${enc(mindId)}/workflows${workflowId ? `/${enc(workflowId)}` : ""}`

export const autopilotApi = {
  workflows: async (mindId: string) => (await api<{ workflows: ApiWorkflow[] }>(base(mindId))).workflows,
  workflow: (mindId: string, workflowId: string) => api<ApiWorkflowDetail>(base(mindId, workflowId)),
  save: (mindId: string, workflowId: string, canvas: Canvas) =>
    api<{ workflowId: string; autopilot: Autopilot | null }>(base(mindId, workflowId), { method: "PUT", body: canvas }),
  remove: (mindId: string, workflowId: string) => api<void>(base(mindId, workflowId), { method: "DELETE" }),
  autopilot: async (mindId: string, workflowId: string) => (await api<{ autopilot: Autopilot | null }>(`${base(mindId, workflowId)}/autopilot`)).autopilot,
  /** Turns the schedule on or pauses it. 409 `cannot_autopilot` comes back as ApiError with `details.issues`. */
  setAutopilot: async (mindId: string, workflowId: string, enabled: boolean) =>
    (await api<{ autopilot: Autopilot }>(`${base(mindId, workflowId)}/autopilot`, { method: "PUT", body: { enabled } })).autopilot,
  runs: async (mindId: string, workflowId: string) => (await api<{ runs: WorkflowRun[] }>(`${base(mindId, workflowId)}/runs?limit=20`)).runs,
  /** "Run now": a manual run, SSE like chat. Its result also shows in `runs`. */
  runNow: (mindId: string, workflowId: string, onEvent: (e: RunEvent) => void, signal?: AbortSignal) =>
    stream(`${base(mindId, workflowId)}/runs`, { ...ownerTimeZone() }, onEvent, signal),
}
