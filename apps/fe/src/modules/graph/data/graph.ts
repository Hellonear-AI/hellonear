// The Mind Graph (#17, design C2): the Mind in the centre, its skills around it, and the tools,
// apps and wallet each skill reaches, built from the Mind's skills and its run events. Node ids
// follow docs/api-contract.md §4 (the engine's `nodeIdFor`, engine/src/graph.ts), so live events
// light up the same nodes the history built.

import type { RunEvent, ToolStatus, ToolStep } from "@/modules/runs/data/events"
import type { ApiSkill } from "@/modules/skills/api"
import { skillCopy, TOOLKIT_NAME } from "@/modules/skills/data/skills"
import { TOOLS } from "@/modules/runs/data/tools"

export type NodeKind = "mind" | "skill" | "tool" | "app" | "wallet" | "memory" | "model" | "workflow"

/** What a node did last: running, then ok / error / denied, or waiting on the owner. */
export type NodeState = "running" | "ok" | "error" | "denied" | "waiting"

export type GraphNode = {
  id: string
  kind: NodeKind
  label: string
  /** Calls in the events read (history and the run on screen). */
  uses: number
  state?: NodeState
  /** When `state` was last set (ms), to time its pulse. */
  at?: number
  /** The run and tool call that set `state`, to tell a live state from an old one. */
  run?: string
  call?: string
  /** For app nodes: which logo to draw. */
  app?: "gmail" | "googlecalendar" | "googlemeet" | "mail"
}

export type GraphLink = { source: string; target: string }

const WALLET_TOOLS = new Set(["send_payment", "get_balance", "list_payments"])
const APP_TOOL = /^(gmail|googlecalendar|mail)_/
const SKILL_NAME_ARG: Record<string, string> = { skill: "name", skill_read: "skillName" }

/** The engine's node id for a tool call (engine/src/graph.ts, docs/api-contract.md §4). */
export function nodeIdFor(mindId: string, tool: string, args?: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>
  const skillArg = SKILL_NAME_ARG[tool]
  if (skillArg && typeof a[skillArg] === "string") return `skill:${a[skillArg]}`
  if (WALLET_TOOLS.has(tool)) return `wallet:${mindId}`
  if (APP_TOOL.test(tool)) return `app:${tool.split("_")[0]}`
  return `tool:${tool}`
}



function kindOf(id: string): NodeKind {
  const k = id.split(":")[0]
  return (["mind", "skill", "tool", "app", "wallet", "memory", "model", "workflow"] as const).find((x) => x === k) ?? "tool"
}

function labelOf(id: string, mindName: string): string {
  const [kind, rest = ""] = id.split(/:(.*)/)
  if (kind === "mind") return mindName
  if (kind === "skill") return skillCopy(rest).title
  if (kind === "wallet") return "Wallet"
  if (kind === "memory") return "Memory"
  if (kind === "app") return rest === "mail" ? `${mindName}'s email` : (TOOLKIT_NAME[rest as keyof typeof TOOLKIT_NAME] ?? rest)
  if (kind === "tool") return TOOLS[rest]?.node ?? rest.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  // workflow:{workflowId}: the id comes from the job's name ("wallet-watch" -> "Wallet watch").
  if (kind === "workflow") return rest ? rest.replace(/-\d+$/, "").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "A job"
  return rest
}

const STATE_OF: Record<string, NodeState> = {
  ok: "ok",
  error: "error",
  policy_denied: "denied",
  wallet_frozen: "denied",
  awaiting_approval: "waiting",
  declined: "error",
}

/**
 * Nodes and links for a Mind: every equipped skill, every tool and app those skills reach, then
 * anything the events touched that isn't there yet (a skill it picked up, a job). `uses` and the
 * last state come from the events, oldest first.
 */
export function buildGraph({
  mindId,
  name,
  skills,
  catalog,
  events,
}: {
  mindId: string
  name: string
  skills: string[]
  catalog: ApiSkill[]
  events: RunEvent[]
}): { nodes: GraphNode[]; links: GraphLink[] } {
  const mind = `mind:${mindId}`
  const nodes = new Map<string, GraphNode>()
  const links = new Map<string, GraphLink>()
  const add = (id: string) => {
    let n = nodes.get(id)
    if (!n) {
      n = { id, kind: kindOf(id), label: labelOf(id, name), uses: 0 }
      const app = id.startsWith("app:") ? id.slice(4) : null
      if (app === "gmail" || app === "googlecalendar" || app === "googlemeet" || app === "mail") n.app = app
      nodes.set(id, n)
    }
    return n
  }
  const link = (source: string, target: string) => {
    if (source !== target) links.set(`${source}>${target}`, { source, target })
  }

  add(mind)
  for (const skillId of skills) {
    // The guide every Mind has can't be added or removed (engine `builtin`), so it isn't shown.
    if (skillId === "hellonear-guide") continue
    const info = catalog.find((c) => c.skillId === skillId)
    if (!info || info.status === "blocked") continue
    const s = `skill:${skillId}`
    add(s)
    link(mind, s)
    for (const tool of info.tools) {
      const t = nodeIdFor(mindId, tool)
      // One parent each, like a tree: a tool several skills share (the clock) hangs off the first,
      // so lines don't cross the graph (Ancung, 10 Nov).
      const shared = nodes.has(t)
      add(t)
      if (!shared) link(s, t)
    }
    // Apps a skill connects (Google Meet comes with Daily planner's meetings).
    for (const c of info.connections) {
      if (c === "googlemeet") {
        add("app:googlemeet")
        link(s, "app:googlemeet")
      }
    }
  }

  const byCall = new Map<string, string>()
  for (const e of events) {
    const t = e.ts ? Date.parse(e.ts) : 0
    if (e.type === "tool.called" && e.tool) {
      let id = e.nodeId ?? nodeIdFor(mindId, e.tool, e.args)
      if (id === "skill:hellonear-guide") continue
      // Mastra's working memory tool is the Mind's memory (docs/api-contract.md §4, Memory).
      if (id === "tool:updateWorkingMemory") id = `memory:${mindId}`
      const n = add(id)
      if (![...links.values()].some((l) => l.target === id)) link(mind, id)
      n.uses += 1
      n.state = "running"
      n.at = t
      n.run = e.runId
      n.call = e.toolCallId
      if (e.toolCallId) byCall.set(e.toolCallId, id)
      // A meeting with a Meet link also lights Google Meet (#97).
      if (e.tool === "googlecalendar_create_meeting" && (e.args as { meet?: unknown } | undefined)?.meet && nodes.has("app:googlemeet")) {
        const m = add("app:googlemeet")
        m.uses += 1
        m.state = "running"
        m.at = t
        m.run = e.runId
        m.call = e.toolCallId
      }
    } else if ((e.type === "tool.result" || e.type === "tool.error" || e.type === "tool.approval_required") && e.toolCallId) {
      const id = byCall.get(e.toolCallId) ?? (e.nodeId || null)
      const n = id ? nodes.get(id) : undefined
      if (!n) continue
      const status = e.type === "tool.approval_required" ? "awaiting_approval" : (e.status ?? (e.type === "tool.error" ? "error" : "ok"))
      n.state = STATE_OF[status] ?? (e.type === "tool.error" ? "error" : "ok")
      n.at = t
      if (n.id === "app:googlecalendar" && nodes.get("app:googlemeet")?.state === "running") {
        const m = nodes.get("app:googlemeet")!
        m.state = n.state
        m.at = t
      }
    } else if (e.type === "workflow.started" && e.nodeId) {
      // A job is drawn once, however often it ran.
      add(e.nodeId)
      link(mind, e.nodeId)
    }
  }
  return { nodes: [...nodes.values()], links: [...links.values()] }
}

/**
 * States that only mean something now: "running" belongs to the run on screen, "waiting" to an
 * approval that is still open. Older ones (a run that ended, an approval declined, which never
 * gets a result event) are dropped, so history sizes the bubbles without making them pulse
 * (Ancung, 10 Nov: Meet and Wallet pulsed before anything was sent).
 */
export function liveStates(nodes: GraphNode[], streamingRun: string | null, openCalls: Set<string>): GraphNode[] {
  return nodes.map((n) => {
    if (n.state === "running" && !(streamingRun && n.run === streamingRun)) return { ...n, state: undefined }
    if (n.state === "waiting" && !(n.call && openCalls.has(n.call))) return { ...n, state: undefined }
    return n
  })
}

/** The graph node a tool call lights, with the FE's own mappings (Memory, no built-in guide). */
export function callNode(mindId: string, e: RunEvent): string | null {
  if (!e.tool) return null
  const id = e.nodeId ?? nodeIdFor(mindId, e.tool, e.args)
  if (id === "skill:hellonear-guide") return null
  return id === "tool:updateWorkingMemory" ? `memory:${mindId}` : id
}

/**
 * The latest calls that reached any of `ids`, newest first, as the chat's tool steps, so a picked
 * node can show what went in and came back (Axel, via Ancung, 10 Nov).
 */
export function callsOf(ids: Set<string>, events: RunEvent[], mindId: string, max = 5): ToolStep[] {
  const steps = new Map<string, ToolStep>()
  for (const e of events) {
    if (!e.toolCallId) continue
    if (e.type === "tool.called") {
      const id = callNode(mindId, e)
      if (!id || !ids.has(id)) continue
      steps.set(e.toolCallId, { toolCallId: e.toolCallId, tool: e.tool!, nodeId: id, status: "running", args: e.args, result: null, startedAt: e.ts })
      continue
    }
    const step = steps.get(e.toolCallId)
    if (!step) continue
    if (e.type === "tool.approval_required") step.status = "awaiting_approval"
    else if (e.type === "tool.result" || e.type === "tool.error") {
      const own = (e.result as { status?: unknown } | null)?.status
      const status = (typeof e.status === "string" ? e.status : typeof own === "string" ? own : e.type === "tool.error" ? "error" : "ok") as ToolStatus
      step.status = (["ok", "error", "policy_denied", "wallet_frozen", "declined"] as string[]).includes(status) ? status : e.type === "tool.error" ? "error" : "ok"
      step.result = e.result ?? null
      if (typeof e.error === "string") step.error = e.error
      step.endedAt = e.ts
    }
  }
  return [...steps.values()].sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? "")).slice(0, max)
}
