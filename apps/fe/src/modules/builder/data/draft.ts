// The Builder's own model of a job (design "7 · Automations" B1), kept to what the engine accepts
// (docs/api-contract.md §2): a Start block with a schedule, then a straight line of steps. Stage 1
// (9 Nov) has one kind of step, "Ask the Mind" (an agent node with a prompt); tools and If come
// next. A saved canvas this model can't hold (an idea with a tool or an If) isn't opened here.

import type { Canvas, CanvasNode } from "@/modules/autopilot/api"

export type Repeat = "daily" | "weekdays" | "weekly"

export type Draft = {
  name: string
  repeat: Repeat
  /** 0 = Sunday, for "weekly". */
  day: number
  /** "08:00", 24 h. */
  time: string
  timezone: string
  steps: { id: string; kind: "agent"; prompt: string }[]
}

export const PROMPT_MAX = 4000
export const NAME_MAX = 60

export function emptyDraft(timezone: string): Draft {
  return { name: "", repeat: "daily", day: 1, time: "08:00", timezone, steps: [] }
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

const at = (i: number) => ({ x: 0, y: i * 140 })

export function toCanvas(d: Draft): Canvas {
  const nodes: CanvasNode[] = [
    { id: "start", type: "trigger", position: at(0), data: { schedule: { cron: cronOf(d), timezone: d.timezone } } },
    ...d.steps.map((s, i): CanvasNode => ({ id: s.id, type: "agent", position: at(i + 1), data: { prompt: s.prompt.trim() } })),
  ]
  const order = nodes.map((n) => n.id)
  return { name: d.name.trim(), nodes, edges: order.slice(1).map((id, i) => ({ source: order[i], target: id })) }
}

/** A saved canvas as a draft, or null when it has blocks Stage 1 can't edit. */
export function fromCanvas(c: Canvas, fallbackZone: string): Draft | null {
  const trigger = c.nodes.find((n) => n.type === "trigger")
  if (!trigger || trigger.type !== "trigger") return null
  const rep = trigger.data.schedule ? repeatOf(trigger.data.schedule.cron) : null
  if (!rep) return null
  const steps: Draft["steps"] = []
  let at: string = trigger.id
  const seen = new Set<string>([at])
  for (;;) {
    const out = c.edges.filter((e) => e.source === at)
    if (out.length === 0) break
    if (out.length > 1 || out[0].sourceHandle) return null
    const n = c.nodes.find((x) => x.id === out[0].target)
    if (!n || n.type !== "agent" || seen.has(n.id)) return null
    seen.add(n.id)
    steps.push({ id: n.id, kind: "agent", prompt: n.data.prompt })
    at = n.id
  }
  if (seen.size !== c.nodes.length) return null
  return { name: c.name, ...rep, timezone: trigger.data.schedule?.timezone ?? fallbackZone, steps }
}

/** "Morning inbox!" -> "morning-inbox", unique among `taken` (engine rule: lowercase words and dashes, max 48). */
export function workflowIdFor(name: string, taken: string[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "")
  // "new" is the Builder's own route (/autopilot/new).
  const base = !slug || slug === "new" ? "job" : slug
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`
}

export type DraftProblem = { where: "name" | "schedule" | "steps" | string; text: string }

/** What would stop Save, checked as you type, before the engine checks it again. */
export function draftProblems(d: Draft): DraftProblem[] {
  const out: DraftProblem[] = []
  if (!d.name.trim()) out.push({ where: "name", text: "Give the job a name." })
  if (!/^\d{2}:\d{2}$/.test(d.time)) out.push({ where: "schedule", text: "Pick a time." })
  if (!d.steps.length) out.push({ where: "steps", text: "Add at least one step after Start." })
  for (const s of d.steps) if (!s.prompt.trim()) out.push({ where: s.id, text: "Say what the Mind should do in this step." })
  return out
}
