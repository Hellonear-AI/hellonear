// The Builder's own model of a job (design "7 · Automations" B1), kept to what the engine accepts
// (docs/api-contract.md §2, the tree canvas of #164): a Start block with a schedule, then a line of
// blocks. A block is a step ("Ask the Mind", a tool from data/tools.ts, or a website call), an If
// with its own Yes and No lines, or End. Ifs can sit anywhere, ways can hold any blocks, a way
// that doesn't end carries on after its If, and End stops that path. A saved canvas this model
// can't hold isn't opened here.

import type { Canvas, CanvasNode } from "@/modules/autopilot/api"
import { HTTP_FIELDS, NEAR_ACCOUNT, toolInfo, type BuilderTool } from "@/modules/builder/data/tools"
import { shortAddress } from "@/modules/wallet/data/address"

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

/** An If: compares one earlier result and runs its Yes or its No line, then carries on (#164). */
export type IfBlock = {
  id: string
  kind: "if"
  /** The earlier step and the field of its result the If looks at. */
  stepId: string
  field: string
  op: Op
  /** As typed; a number field turns it into a number on save. */
  right: string
  /** The Yes and No lines; empty, or without an End, the path carries on after the If. */
  then: Block[]
  else: Block[]
}
/** End: the path stops here (#164); nothing can follow it. */
export type EndBlock = { id: string; kind: "end" }
export type Block = Step | IfBlock | EndBlock
/** The If's former name, kept for the If panel. */
export type Branch = IfBlock

export const isStep = (b: Block): b is Step => b.kind === "agent" || b.kind === "tool" || b.kind === "http"

export type Draft = {
  name: string
  repeat: Repeat
  /** 0 = Sunday, for "weekly". */
  day: number
  /** "08:00", 24 h. */
  time: string
  timezone: string
  /** The main line after Start. */
  line: Block[]
}

/** Where a line sits: [] is the main line; each part steps into an If's Yes or No. */
export type LinePath = { at: string; h: "then" | "else" }[]

export const MAX_NODES = 20

export const PROMPT_MAX = 4000
export const NAME_MAX = 60

export function emptyDraft(timezone: string): Draft {
  return { name: "", repeat: "daily", day: 1, time: "08:00", timezone, line: [] }
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
  const typed = Object.fromEntries(Object.entries(s.args).map(([k, v]) => [k, v.trim()]))
  const info = toolInfo(s.tool)
  // Optional args left empty aren't sent; a tool may turn what was typed into what it takes.
  const args = Object.fromEntries(Object.entries(info?.toArgs ? info.toArgs(typed) : typed).filter(([k, v]) => v !== "" || !info?.args.find((a) => a.name === k)?.optional))
  return { id: s.id, type: "tool", position: pos(x, y), data: { tool: s.tool, args } }
}

export function rightValue(b: IfBlock, steps: Step[]): string | number {
  const kind = stepFields(steps.find((s) => s.id === b.stepId)).find((f) => f.name === b.field)?.kind
  return kind === "number" ? Number(b.right) : b.right.trim()
}

/** The opposite comparison, to swap Yes and No. */
export const INVERT: Record<Op, Op> = { eq: "ne", ne: "eq", lt: "gte", gte: "lt", lte: "gt", gt: "lte" }

/**
 * The engine's tree canvas (#164): each block links to the next in its line; an If links to its
 * Yes and No lines with `then` / `else` and to what follows it with a plain edge.
 */
export function toCanvas(d: Draft): Canvas {
  const nodes: CanvasNode[] = [{ id: "start", type: "trigger", position: pos(0, 0), data: { schedule: { cron: cronOf(d), timezone: d.timezone } } }]
  const edges: Canvas["edges"] = []
  let row = 0
  const emit = (line: Block[], from: { source: string; handle?: "then" | "else" }, x: number, path: Step[]) => {
    let prev = from
    const seen = [...path]
    for (const b0 of line) {
      // An empty Yes with steps on No is saved as the opposite check with them on Yes: the older
      // engine shape needs a "then" edge, and the meaning is the same (Ancung, 10 Nov).
      const b: Block = b0.kind === "if" && !b0.then.length && b0.else.length ? { ...b0, op: INVERT[b0.op], then: b0.else, else: [] } : b0
      row += 1
      const y = row * 140
      if (b.kind === "if") nodes.push({ id: b.id, type: "condition", position: pos(x, y), data: { left: ref(b.stepId, b.field), op: b.op, right: rightValue(b, seen) } })
      else if (b.kind === "end") nodes.push({ id: b.id, type: "end", position: pos(x, y), data: {} })
      else nodes.push(stepNode(b, x, y))
      edges.push(prev.handle ? { source: prev.source, target: b.id, sourceHandle: prev.handle } : { source: prev.source, target: b.id })
      if (b.kind === "if") {
        emit(b.then, { source: b.id, handle: "then" }, x - 220, seen)
        emit(b.else, { source: b.id, handle: "else" }, x + 220, seen)
      } else if (isStep(b)) seen.push(b)
      prev = { source: b.id }
    }
  }
  emit(d.line, { source: "start" }, 0, [])
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
  const seen = new Set<string>([trigger.id])
  const outOf = (id: string) => c.edges.filter((e) => e.source === id)
  // A line from a node to where it stops, following plain edges; undefined if it can't be edited.
  const lineFrom = (first: string | undefined): Block[] | undefined => {
    const line: Block[] = []
    let next = first
    while (next) {
      const n = byId.get(next)
      if (!n || seen.has(n.id)) return undefined
      seen.add(n.id)
      const out = outOf(n.id)
      const plain = out.filter((e) => !e.sourceHandle)
      if (plain.length > 1) return undefined
      if (n.type === "condition") {
        const m = n.data.left.match(/^\{\{\s*steps\.([\w-]+)\.(\w+)\s*\}\}$/)
        if (!m) return undefined
        const yes = lineFrom(out.find((e) => e.sourceHandle === "then")?.target)
        const no = lineFrom(out.find((e) => e.sourceHandle === "else")?.target)
        if (!yes || !no) return undefined
        line.push({ id: n.id, kind: "if", stepId: m[1], field: m[2], op: n.data.op, right: String(n.data.right), then: yes, else: no })
      } else if (n.type === "end") {
        if (out.length) return undefined
        line.push({ id: n.id, kind: "end" })
      } else {
        const st = stepOf(n)
        if (!st || out.some((e) => e.sourceHandle)) return undefined
        line.push(st)
      }
      next = plain[0]?.target
    }
    return line
  }
  const start = outOf(trigger.id)
  if (start.length > 1 || start[0]?.sourceHandle) return null
  const line = lineFrom(start[0]?.target)
  if (!line || seen.size !== c.nodes.length) return null
  return { name: c.name, ...rep, timezone: trigger.data.schedule?.timezone ?? fallbackZone, line }
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
/** The Mind whose wallet a "Check a NEAR account" step may look at, to name it instead of its address. */
export type Self = { name: string; address: string }

/** Whose account: the Mind's own name, else the account as typed (a long implicit one shortened). */
export function accountWho(account: string, self?: Self): string {
  const a = account.trim()
  if (self?.address && a === self.address) return self.name
  return /^[0-9a-f]{64}$/.test(a) ? shortAddress(a) : a
}

/**
 * Where a step's results come from, in words (Ancung, 10 Nov: two "Balance (NEAR)" didn't say
 * whose): "Omaga's wallet", "lin1er.testnet", a website's host, else the step's title.
 */
export function stepSource(s: Step, self?: Self): string {
  if (s.kind === "tool" && s.tool === "near_view_account" && s.args.accountId?.trim()) {
    const who = accountWho(s.args.accountId, self)
    return self?.address && s.args.accountId.trim() === self.address ? `${who}'s wallet` : who
  }
  if (s.kind === "http") {
    try {
      return new URL(s.url.trim()).hostname || "Call a website"
    } catch {
      return "Call a website"
    }
  }
  return stepTitle(s)
}

export function resultsBefore(steps: Step[], index = steps.length, self?: Self) {
  return steps.slice(0, index).flatMap((s) =>
    stepFields(s).map((f) => ({
      stepId: s.id,
      step: stepTitle(s),
      stepKind: s.kind,
      source: stepSource(s, self),
      // A balance names its account in prompts: {Balance of Omaga}, {Balance of lin1er.testnet}.
      who: s.kind === "tool" && s.tool === "near_view_account" && s.args.accountId?.trim() ? accountWho(s.args.accountId, self) : undefined,
      ...f,
    }))
  )
}

/** One earlier result a block can use. */
export type Result = ReturnType<typeof resultsBefore>[number]

/** Every result the given steps give, naming the Mind's own wallet. */
export const resultsOf = (steps: Step[], self?: Self): Result[] => resultsBefore(steps, steps.length, self)

/** The notes earlier Ask steps wrote, as results for "Email me" (it may only send what the Mind wrote, #146). */
export function notesBefore(steps: Step[], index = steps.length) {
  return steps.slice(0, index).flatMap((s, i) =>
    s.kind === "agent" ? [{ stepId: s.id, step: "Ask", stepKind: s.kind, source: `Note ${i + 1}`, name: "text", label: "Note", kind: "text" as const, who: undefined }] : []
  )
}

export type DraftProblem = { where: string; text: string }

/** What would stop Save, checked as you type, before the engine checks it again. */
function stepProblems(s: Step, out: DraftProblem[]) {
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
        if ((a.kind === "text" || a.kind === "note") && !v && !a.optional) out.push({ where: s.id, text: `${a.label} is required.` })
        if (a.kind === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) out.push({ where: s.id, text: "Time is required." })
        if (a.kind === "minutes" && !(Number.isInteger(Number(v)) && Number(v) >= 5 && Number(v) <= 480)) out.push({ where: s.id, text: "Minutes must be a whole number from 5 to 480." })
      }
    }
}

export function draftProblems(d: Draft): DraftProblem[] {
  const out: DraftProblem[] = []
  if (!d.name.trim()) out.push({ where: "name", text: "Job name is required." })
  if (!/^\d{2}:\d{2}$/.test(d.time)) out.push({ where: "start", text: "Time is required." })
  if (!allBlocks(d.line).some(isStep)) out.push({ where: "steps", text: "Add at least one step after Start." })
  if (allBlocks(d.line).length + 1 > MAX_NODES) out.push({ where: "steps", text: `A job can have at most ${MAX_NODES - 1} blocks.` })
  const check = (line: Block[], before: Step[]) => {
    const seen = [...before]
    line.forEach((b, i) => {
      if (i > 0 && closes(line[i - 1])) out.push({ where: b.id, text: "Nothing can follow here: the path above already ends." })
      if (isStep(b)) {
        stepProblems(b, out)
        seen.push(b)
      } else if (b.kind === "if") {
        const field = stepFields(seen.find((x) => x.id === b.stepId)).find((f) => f.name === b.field) ?? null
        if (!field || field.kind === "list") out.push({ where: b.id, text: "Select a value to compare in the If block." })
        else if (field.kind === "number" && (b.right.trim() === "" || !Number.isFinite(Number(b.right)))) out.push({ where: b.id, text: "Enter a number in the If block." })
        else if (field.kind === "text" && !b.right.trim()) out.push({ where: b.id, text: "Enter a value in the If block." })
        if (!b.then.length && !b.else.length) out.push({ where: b.id, text: "Add a step to If yes or If no." })
        // Older engine rule, kept to be safe: two ways of one Ask each would share one input.
        if (b.then.length === 1 && b.else.length === 1 && b.then[0].kind === "agent" && b.else[0].kind === "agent")
          out.push({ where: b.else[0].id, text: "If yes and If no cannot both ask the Mind when each way is one step." })
        check(b.then, seen)
        check(b.else, seen)
      }
    })
  }
  check(d.line, [])
  return out
}

/**
 * Visits every block, depth first in reading order (an If, then its Yes, then its No), with the
 * path of its line and its index there. Stops as soon as `visit` returns true, and says so.
 */
export function walk(line: Block[], visit: (b: Block, path: LinePath, index: number) => boolean | void, path: LinePath = []): boolean {
  for (let i = 0; i < line.length; i++) {
    const b = line[i]
    if (visit(b, path, i)) return true
    if (b.kind === "if") {
      for (const h of ["then", "else"] as const) if (walk(b[h], visit, [...path, { at: b.id, h }])) return true
    }
  }
  return false
}

/** Rebuilds the tree from the bottom up: each If's ways first, then `fn` of the line that holds it. */
export function mapTree(line: Block[], fn: (line: Block[]) => Block[]): Block[] {
  return fn(line.map((b) => (b.kind === "if" ? { ...b, then: mapTree(b.then, fn), else: mapTree(b.else, fn) } : b)))
}

/** Every block, depth first, in reading order. */
export function allBlocks(line: Block[]): Block[] {
  const out: Block[] = []
  walk(line, (b) => void out.push(b))
  return out
}

/** A block that ends its path: End, or an If whose Yes and No both end. Nothing may follow it. */
export function closes(b: Block | undefined): boolean {
  if (!b) return false
  if (b.kind === "end") return true
  return b.kind === "if" && lineCloses(b.then) && lineCloses(b.else)
}
export const lineCloses = (line: Block[]) => closes(line[line.length - 1])

/**
 * Whether a way at `path` goes on when it runs out: some If around it has blocks after it. The
 * Builder never adds those (like n8n), but the engine accepts them (#165), so a job saved through
 * the API can have them.
 */
export function carriesOn(line: Block[], path: LinePath): boolean {
  for (let k = path.length - 1; k >= 0; k--) {
    const outer = lineAt(line, path.slice(0, k))
    const i = outer.findIndex((x) => x.id === path[k].at)
    if (i >= 0 && i < outer.length - 1) return true
  }
  return false
}

/** The line at `path`. */
export function lineAt(line: Block[], path: LinePath): Block[] {
  let cur = line
  for (const p of path) {
    const b = cur.find((x) => x.id === p.at)
    if (!b || b.kind !== "if") return []
    cur = b[p.h]
  }
  return cur
}

/** The main line with the line at `path` replaced by `fn` of it. */
export function withLine(line: Block[], path: LinePath, fn: (l: Block[]) => Block[]): Block[] {
  if (!path.length) return fn(line)
  const [p, ...rest] = path
  return line.map((b) => (b.id === p.at && b.kind === "if" ? { ...b, [p.h]: withLine(b[p.h], rest, fn) } : b))
}

/** Where a block sits: its line's path and its index there. */
export function locate(line: Block[], id: string, path: LinePath = []): { path: LinePath; index: number } | null {
  let hit: { path: LinePath; index: number } | null = null
  walk(
    line,
    (b, at, index) => {
      if (b.id !== id) return false
      hit = { path: at, index }
      return true
    },
    path
  )
  return hit
}

export function findBlock(line: Block[], id: string): Block | null {
  return allBlocks(line).find((b) => b.id === id) ?? null
}

/** Change one block wherever it is. */
export function updateBlock(line: Block[], id: string, patch: Partial<Block>): Block[] {
  // The ways are rebuilt before the patch, so a patch that brings its own Yes and No wins.
  return mapTree(line, (l) => l.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)))
}

/** Take a block out (an If goes with its ways); an If that looked at it forgets what it looked at. */
export function removeBlock(line: Block[], id: string): Block[] {
  return mapTree(line, (l) => l.filter((b) => b.id !== id).map((b) => (b.kind === "if" && b.stepId === id ? { ...b, stepId: "", field: "" } : b)))
}

/** Put a block at `index` of the line at `path`. */
export function insertBlock(line: Block[], path: LinePath, index: number, block: Block): Block[] {
  return withLine(line, path, (l) => [...l.slice(0, index), block, ...l.slice(index)])
}

/**
 * The steps a place can read (`{{steps.…}}`, #164): those earlier on its own path back to Start.
 * An If's ways may not run, so blocks after an If can't read inside them; a way can read what
 * came before its If, never the other way.
 */
export function stepsAt(line: Block[], path: LinePath, index: number): Step[] {
  const out: Step[] = []
  for (let k = 0; k < path.length; k++) {
    const outer = lineAt(line, path.slice(0, k))
    const at = outer.findIndex((b) => b.id === path[k].at)
    out.push(...outer.slice(0, at).filter(isStep))
    if (outer[at]?.kind !== "if") return out
  }
  out.push(...lineAt(line, path).slice(0, index).filter(isStep))
  return out
}

/** The steps a block can read: those before it on its path. */
export function stepsBefore(line: Block[], id: string): Step[] {
  const hit = locate(line, id)
  return hit ? stepsAt(line, hit.path, hit.index) : []
}

/** Whether a new block of this kind may go at `index` of the line at `path` (#164 rules). */
export function canPlace(line: Block[], path: LinePath, index: number, kind: Block["kind"], self?: Self): boolean {
  const here = lineAt(line, path)
  // Nothing after a block that ends the path, and End only last.
  if (index > 0 && closes(here[index - 1])) return false
  // Like n8n, a path goes on only inside an If's Yes and No, never after the If (Ancung, 10 Nov:
  // a third box under the If, for steps after both ways, read as strange). The engine still
  // accepts it (#165), so jobs saved that way still open.
  if (index > 0 && here[index - 1].kind === "if") return false
  if (kind === "end" && index !== here.length) return false
  if (kind === "end" && here.length === 0 && path.length === 0) return false
  if (allBlocks(line).length + 1 >= MAX_NODES) return false
  if (kind === "if") return resultsBefore(stepsAt(line, path, index), undefined, self).some(comparable)
  return true
}

const REF = /\{\{\s*steps\.([\w-]+)\.(\w+)\s*\}\}/g

/** "Balance (NEAR)" -> "Balance"; a second "Balance" from another step becomes "Balance 2". */
type Token = { stepId: string; name: string; label: string; who?: string; stepKind?: Step["kind"] }

export function tokenLabels(results: Token[]): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Map<string, number>()
  for (const r of results) {
    const plain = r.label.replace(/ \(.*\)$/, "")
    const base = r.who ? `${plain} of ${r.who}` : plain
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    out.set(`${r.stepId}.${r.name}`, n === 1 ? base : `${base} ${n}`)
  }
  return out
}

/** A prompt split into text and result chips (Ancung, 10 Nov: chips in the field, not {Label}). */
export type PromptPart = { text: string } | { chip: string; ref: string; tone?: "tool" | "http" }

export function promptParts(prompt: string, results: Token[]): PromptPart[] {
  const labels = tokenLabels(results)
  const out: PromptPart[] = []
  let at = 0
  for (const m of prompt.matchAll(REF)) {
    const key = `${m[1]}.${m[2]}`
    const label = labels.get(key)
    if (!label) continue
    if (m.index > at) out.push({ text: prompt.slice(at, m.index) })
    const kind = results.find((r) => `${r.stepId}.${r.name}` === key)?.stepKind
    out.push({ chip: label, ref: m[0], tone: kind === "http" ? "http" : "tool" })
    at = m.index + m[0].length
  }
  if (at < prompt.length) out.push({ text: prompt.slice(at) })
  return out
}

