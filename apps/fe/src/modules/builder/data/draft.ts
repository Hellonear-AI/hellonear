// The Builder's own model of a job (design "7 · Automations" B1), kept to what the engine accepts
// (docs/api-contract.md §2): a Start block with a schedule, a straight line of steps, then at most
// one If whose yes and no endings are one step each (the no ending may be "stop"). Steps are
// "Ask the Mind" (an agent node) or a tool from data/tools.ts. A saved canvas this model can't hold
// (a website call, two Ifs) isn't opened here.

import type { Canvas, CanvasNode } from "@/modules/autopilot/api"
import { fieldInfo, NEAR_ACCOUNT, toolInfo } from "@/modules/builder/data/tools"

export type Repeat = "daily" | "weekdays" | "weekly"
export type Op = "eq" | "ne" | "lt" | "lte" | "gt" | "gte"

export type AskStep = { id: string; kind: "agent"; prompt: string }
export type ToolStep = { id: string; kind: "tool"; tool: string; args: Record<string, string> }
export type Step = AskStep | ToolStep

export type Branch = {
  id: string
  /** The earlier tool step and the field of its result the If looks at. */
  stepId: string
  field: string
  op: Op
  /** As typed; a number field turns it into a number on save. */
  right: string
  then: AskStep | null
  else: AskStep | null
}

export type Draft = {
  name: string
  repeat: Repeat
  /** 0 = Sunday, for "weekly". */
  day: number
  /** "08:00", 24 h. */
  time: string
  timezone: string
  steps: Step[]
  branch: Branch | null
}

export const PROMPT_MAX = 4000
export const NAME_MAX = 60

export function emptyDraft(timezone: string): Draft {
  return { name: "", repeat: "daily", day: 1, time: "08:00", timezone, steps: [], branch: null }
}

export function cronOf(d: Pick<Draft, "repeat" | "day" | "time">): string {
  const [h, m] = d.time.split(":").map((x) => Number(x))
  const dow = d.repeat === "daily" ? "*" : d.repeat === "weekdays" ? "1-5" : String(d.day)
  return `${m || 0} ${h || 0} * * ${dow}`
}

/** Back from cron, for the shapes this editor makes; null for anything else. */
export function repeatOf(cron: string): Pick<Draft, "repeat" | "day" | "time"> | null {
  const p = cron.trim().split(/\s+/)
  if (p.length !== 5 || !/^\d+$/.test(p[0]) || !/^\d+$/.test(p[1]) || p[2] !== "*" || p[3] !== "*") return null
  const time = `${p[1].padStart(2, "0")}:${p[0].padStart(2, "0")}`
  if (p[4] === "*") return { repeat: "daily", day: 1, time }
  if (p[4] === "1-5") return { repeat: "weekdays", day: 1, time }
  if (/^[0-6]$/.test(p[4])) return { repeat: "weekly", day: Number(p[4]), time }
  return null
}

/** The reference an If (or a prompt) uses for a step's result field. */
export const ref = (stepId: string, field: string) => `{{steps.${stepId}.${field}}}`

const pos = (x: number, y: number) => ({ x, y })

function stepNode(s: Step, x: number, y: number): CanvasNode {
  if (s.kind === "agent") return { id: s.id, type: "agent", position: pos(x, y), data: { prompt: s.prompt.trim() } }
  return { id: s.id, type: "tool", position: pos(x, y), data: { tool: s.tool, args: Object.fromEntries(Object.entries(s.args).map(([k, v]) => [k, v.trim()])) } }
}

export function rightValue(b: Branch, steps: Step[]): string | number {
  const step = steps.find((s) => s.id === b.stepId)
  const kind = step?.kind === "tool" ? fieldInfo(step.tool, b.field)?.kind : null
  return kind === "number" ? Number(b.right) : b.right.trim()
}

export function toCanvas(d: Draft): Canvas {
  const nodes: CanvasNode[] = [{ id: "start", type: "trigger", position: pos(0, 0), data: { schedule: { cron: cronOf(d), timezone: d.timezone } } }]
  d.steps.forEach((s, i) => nodes.push(stepNode(s, 0, (i + 1) * 140)))
  const order = nodes.map((n) => n.id)
  const edges: Canvas["edges"] = order.slice(1).map((id, i) => ({ source: order[i], target: id }))
  const b = d.branch
  if (b) {
    const y = (d.steps.length + 1) * 140
    nodes.push({ id: b.id, type: "condition", position: pos(0, y), data: { left: ref(b.stepId, b.field), op: b.op, right: rightValue(b, d.steps) } })
    edges.push({ source: order[order.length - 1], target: b.id })
    if (b.then) {
      nodes.push(stepNode(b.then, -160, y + 140))
      edges.push({ source: b.id, target: b.then.id, sourceHandle: "then" })
    }
    if (b.else) {
      nodes.push(stepNode(b.else, 160, y + 140))
      edges.push({ source: b.id, target: b.else.id, sourceHandle: "else" })
    }
  }
  return { name: d.name.trim(), nodes, edges }
}

function stepOf(n: CanvasNode | undefined): Step | null {
  if (!n) return null
  if (n.type === "agent") return { id: n.id, kind: "agent", prompt: n.data.prompt }
  if (n.type === "tool" && toolInfo(n.data.tool)) {
    return { id: n.id, kind: "tool", tool: n.data.tool, args: Object.fromEntries(Object.entries(n.data.args ?? {}).map(([k, v]) => [k, String(v)])) }
  }
  return null
}

/** A saved canvas as a draft, or null when it has blocks the Builder can't edit yet. */
export function fromCanvas(c: Canvas, fallbackZone: string): Draft | null {
  const trigger = c.nodes.find((n) => n.type === "trigger")
  if (!trigger || trigger.type !== "trigger") return null
  const rep = trigger.data.schedule ? repeatOf(trigger.data.schedule.cron) : null
  if (!rep) return null
  const byId = new Map(c.nodes.map((n) => [n.id, n]))
  const steps: Step[] = []
  let branch: Branch | null = null
  let at = trigger.id
  const seen = new Set<string>([at])
  for (;;) {
    const out = c.edges.filter((e) => e.source === at)
    if (out.length === 0) break
    if (out.length > 1 || out[0].sourceHandle) return null
    const n = byId.get(out[0].target)
    if (!n || seen.has(n.id)) return null
    seen.add(n.id)
    if (n.type === "condition") {
      const m = n.data.left.match(/^\{\{\s*steps\.([\w-]+)\.(\w+)\s*\}\}$/)
      if (!m) return null
      const ending = (h: "then" | "else") => {
        const e = c.edges.find((x) => x.source === n.id && x.sourceHandle === h)
        if (!e) return null
        const s = stepOf(byId.get(e.target))
        if (!s || s.kind !== "agent") return undefined
        seen.add(s.id)
        return s
      }
      const yes = ending("then")
      const no = ending("else")
      if (yes === undefined || no === undefined) return null
      branch = { id: n.id, stepId: m[1], field: m[2], op: n.data.op, right: String(n.data.right), then: yes, else: no }
      break
    }
    const s = stepOf(n)
    if (!s) return null
    steps.push(s)
    at = n.id
  }
  if (seen.size !== c.nodes.length) return null
  return { name: c.name, ...rep, timezone: trigger.data.schedule?.timezone ?? fallbackZone, steps, branch }
}

/** "Morning inbox!" -> "morning-inbox", unique among `taken` (engine rule: lowercase words and dashes, max 48). */
export function workflowIdFor(name: string, taken: string[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "")
  // "new" is the Builder's own route (/autopilot/new).
  const base = !slug || slug === "new" ? "job" : slug
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`
}

/** The results an If (or a later prompt) can look at: each earlier tool step's fields. */
export function resultsBefore(steps: Step[], index = steps.length) {
  return steps.slice(0, index).flatMap((s) =>
    s.kind === "tool" ? (toolInfo(s.tool)?.fields ?? []).map((f) => ({ stepId: s.id, step: toolInfo(s.tool)!.title, ...f })) : []
  )
}

export type DraftProblem = { where: string; text: string }

/** What would stop Save, checked as you type, before the engine checks it again. */
export function draftProblems(d: Draft): DraftProblem[] {
  const out: DraftProblem[] = []
  if (!d.name.trim()) out.push({ where: "name", text: "Give the job a name." })
  if (!/^\d{2}:\d{2}$/.test(d.time)) out.push({ where: "start", text: "Pick a time." })
  if (!d.steps.length) out.push({ where: "steps", text: "Add at least one step after Start." })
  for (const s of d.steps) {
    if (s.kind === "agent" && !s.prompt.trim()) out.push({ where: s.id, text: "Say what the Mind should do in this step." })
    if (s.kind === "tool") {
      for (const a of toolInfo(s.tool)?.args ?? []) {
        const v = (s.args[a.name] ?? "").trim()
        if (a.kind === "account" && !NEAR_ACCOUNT.test(v)) out.push({ where: s.id, text: `${a.label}: enter a NEAR account, like shop.testnet.` })
      }
    }
  }
  const b = d.branch
  if (b) {
    const step = d.steps.find((s) => s.id === b.stepId)
    const field = step?.kind === "tool" ? fieldInfo(step.tool, b.field) : null
    if (!field) out.push({ where: b.id, text: "If: pick a result from a tool step before it." })
    else if (field.kind === "number" && (b.right.trim() === "" || !Number.isFinite(Number(b.right)))) out.push({ where: b.id, text: "If: enter a number." })
    else if (field.kind === "text" && !b.right.trim()) out.push({ where: b.id, text: "If: enter what to compare with." })
    if (!b.then) out.push({ where: b.id, text: "If: add a step for If yes." })
    // Engine rule (docs/api-contract.md §2): both ways can't ask the Mind (they'd need the same input).
    if (b.then && b.else) out.push({ where: b.else.id, text: "If yes and If no can't both ask the Mind. Let If no stop." })
    for (const s of [b.then, b.else]) if (s && !s.prompt.trim()) out.push({ where: s.id, text: "Say what the Mind should do in this step." })
  }
  return out
}
