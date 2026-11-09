// The Builder's own model of a job (design "7 · Automations" B1), kept to what the engine accepts
// (docs/api-contract.md §2): a Start block with a schedule, a straight line of steps, then at most
// one If whose yes and no endings are one step each (the no ending may be "stop"). Steps are
// "Ask the Mind" (an agent node) or a tool from data/tools.ts. A saved canvas this model can't hold
// (a website call, two Ifs) isn't opened here.

import type { Canvas, CanvasNode } from "@/modules/autopilot/api"
import { HTTP_FIELDS, NEAR_ACCOUNT, toolInfo, type BuilderTool } from "@/modules/builder/data/tools"

export type Repeat = "daily" | "weekdays" | "weekly"
export type Op = "eq" | "ne" | "lt" | "lte" | "gt" | "gte"

export type AskStep = { id: string; kind: "agent"; prompt: string }
export type ToolStep = { id: string; kind: "tool"; tool: string; args: Record<string, string> }
/** "Call a website": an http node. `key` is a saved key's name, sent as `Authorization: Bearer`. */
export type HttpStep = { id: string; kind: "http"; method: "GET" | "POST"; url: string; key: string; body: string }
export type Step = AskStep | ToolStep | HttpStep

/** The result fields a step gives later blocks. */
export function stepFields(s: Step | undefined): BuilderTool["fields"] {
  if (!s) return []
  if (s.kind === "tool") return toolInfo(s.tool)?.fields ?? []
  if (s.kind === "http") return HTTP_FIELDS
  return []
}

export const stepTitle = (s: Step) => (s.kind === "tool" ? (toolInfo(s.tool)?.title ?? "A tool") : s.kind === "http" ? "Call a website" : "Ask")

const BEARER = /^Bearer \{\{secrets\.([A-Z][A-Z0-9_]{0,63})\}\}$/

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
  if (s.kind === "http") {
    return {
      id: s.id,
      type: "http",
      position: pos(x, y),
      data: {
        method: s.method,
        url: s.url.trim(),
        ...(s.key ? { headers: { Authorization: `Bearer {{secrets.${s.key}}}` } } : {}),
        ...(s.method === "POST" && s.body.trim() ? { body: s.body } : {}),
      },
    }
  }
  return { id: s.id, type: "tool", position: pos(x, y), data: { tool: s.tool, args: Object.fromEntries(Object.entries(s.args).map(([k, v]) => [k, v.trim()])) } }
}

export function rightValue(b: Branch, steps: Step[]): string | number {
  const kind = stepFields(steps.find((s) => s.id === b.stepId)).find((f) => f.name === b.field)?.kind
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
  if (n.type === "http") {
    const headers = Object.entries(n.data.headers ?? {})
    const key = headers.length === 1 && headers[0][0] === "Authorization" ? headers[0][1].match(BEARER)?.[1] : headers.length ? undefined : ""
    if (key === undefined || (n.data.method !== "GET" && n.data.method !== "POST")) return null
    return { id: n.id, kind: "http", method: n.data.method, url: n.data.url, key, body: n.data.body ?? "" }
  }
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

/** Moves a step so it lands at place `to` in the line as it was before the move (a drop spot's index). */
export function moveStepIn<T extends { id: string }>(steps: T[], id: string, to: number): T[] {
  const from = steps.findIndex((s) => s.id === id)
  if (from < 0) return steps
  const out = [...steps]
  const [moved] = out.splice(from, 1)
  out.splice(to > from ? to - 1 : to, 0, moved)
  return out
}

/** "Morning inbox!" -> "morning-inbox", unique among `taken` (engine rule: lowercase words and dashes, max 48). */
export function workflowIdFor(name: string, taken: string[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "")
  // "new" is the Builder's own route (/autopilot/new).
  const base = !slug || slug === "new" ? "job" : slug
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`
}

/** The results an If can compare: number and text fields only. */
export const comparable = (r: { kind: string }) => r.kind !== "list"

/** The results an If (or a later prompt) can look at: each earlier tool step's fields. */
export function resultsBefore(steps: Step[], index = steps.length) {
  return steps.slice(0, index).flatMap((s) =>
    stepFields(s).map((f) => ({ stepId: s.id, step: stepTitle(s), ...f }))
  )
}

export type DraftProblem = { where: string; text: string }

/** What would stop Save, checked as you type, before the engine checks it again. */
export function draftProblems(d: Draft): DraftProblem[] {
  const out: DraftProblem[] = []
  if (!d.name.trim()) out.push({ where: "name", text: "Job name is required." })
  if (!/^\d{2}:\d{2}$/.test(d.time)) out.push({ where: "start", text: "Time is required." })
  if (!d.steps.length) out.push({ where: "steps", text: "Add at least one step after Start." })
  for (const s of d.steps) {
    if (s.kind === "agent" && !s.prompt.trim()) out.push({ where: s.id, text: "Instructions are required for this step." })
    if (s.kind === "http") {
      let ok = false
      try {
        ok = new URL(s.url.trim()).protocol === "https:"
      } catch {
        ok = false
      }
      if (!ok) out.push({ where: s.id, text: "Website address must start with https://." })
      if (/\$\{/.test(s.url + s.body)) out.push({ where: s.id, text: "Website address and body cannot contain \"${\"." })
    }
    if (s.kind === "tool") {
      for (const a of toolInfo(s.tool)?.args ?? []) {
        const v = (s.args[a.name] ?? "").trim()
        if (a.kind === "account" && !NEAR_ACCOUNT.test(v)) out.push({ where: s.id, text: "Enter a valid NEAR account, for example shop.testnet." })
      }
    }
  }
  const b = d.branch
  if (b) {
    const field = stepFields(d.steps.find((s) => s.id === b.stepId)).find((f) => f.name === b.field) ?? null
    if (!field || field.kind === "list") out.push({ where: b.id, text: "Select a value to compare in the If block." })
    else if (field.kind === "number" && (b.right.trim() === "" || !Number.isFinite(Number(b.right)))) out.push({ where: b.id, text: "Enter a number in the If block." })
    else if (field.kind === "text" && !b.right.trim()) out.push({ where: b.id, text: "Enter a value in the If block." })
    if (!b.then) out.push({ where: b.id, text: "Add a step for If yes." })
    // Engine rule (docs/api-contract.md §2): both ways can't ask the Mind (they'd need the same input).
    if (b.then && b.else) out.push({ where: b.else.id, text: "If yes and If no cannot both ask the Mind. Set If no to stop." })
    for (const s of [b.then, b.else]) if (s && !s.prompt.trim()) out.push({ where: s.id, text: "Instructions are required for this step." })
  }
  return out
}
