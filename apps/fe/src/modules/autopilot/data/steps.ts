// A job's steps in plain words (design P1.1 "Steps"), read from its saved canvas in run order.
// No code, no ids: "Check 7a1c90e2…a84f3b", "If the balance is under 5 NEAR".

import type { Canvas, CanvasNode } from "@/modules/autopilot/api"
import { scheduleText, zoneName } from "@/modules/autopilot/data/schedule"
import { accountWho, promptParts, type PromptPart, type Self } from "@/modules/builder/data/draft"
import { HTTP_FIELDS, toolInfo } from "@/modules/builder/data/tools"
import { shortAddress } from "@/modules/wallet/data/address"

export type JobStep = {
  id: string
  kind: CanvasNode["type"]
  title: string
  note?: string
  branch?: "then" | "else"
  /** An Ask step's prompt with result chips. */
  prompt?: PromptPart[]
  /** An If's Yes and No lines (#164: Ifs anywhere, ways of any blocks). */
  then?: JobStep[]
  else?: JobStep[]
}

const OP: Record<string, string> = { eq: "is", ne: "is not", lt: "is under", lte: "is at most", gt: "is over", gte: "is at least" }

/** "{{steps.balance.balanceNear}}" -> "the balance". */
function refName(ref: string): string {
  const field = ref.match(/\{\{\s*(?:steps\.[\w-]+|input)\.(\w+)\s*\}\}/)?.[1]
  if (!field) return "the value"
  if (/balance/i.test(field)) return "the balance"
  return `the ${field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}`
}

const TOOL: Record<string, (args: Record<string, unknown>) => string> = {
  near_view_account: (a) => `Check ${typeof a.accountId === "string" ? shortAddress(a.accountId) : "an account"}`,
  get_balance: () => "Check the balance",
  get_time: () => "Check the time",
  add_numbers: () => "Add up numbers",
  googlecalendar_list_events: () => "Read the calendar",
  gmail_list_emails: () => "Read the inbox",
  googlecalendar_block_time: (a) => `Add ${typeof a.title === "string" && a.title ? `"${a.title}"` : "an event"} to your calendar at ${typeof a.at === "string" ? a.at : "a set time"}`,
  mail_send_to_owner: (a) => `Email you${typeof a.subject === "string" && a.subject ? `: "${a.subject}"` : ""}`,
  // The track apps' read steps (#211).
  googlesheets_read_range: (a) => `Read a Google Sheet${typeof a.range === "string" && a.range ? ` (${a.range})` : ""}`,
  googledocs_read_document: () => "Read a Google Doc",
  notion_search: (a) => `Search Notion${typeof a.query === "string" && a.query ? ` for "${a.query}"` : ""}`,
}

/** Each tool and website step's result fields, in canvas order, to read prompts as {Balance}. */
function resultsOf(canvas: Canvas, self?: Self) {
  return canvas.nodes.flatMap((n) => {
    const fields = n.type === "tool" ? (toolInfo(n.data.tool)?.fields ?? []) : n.type === "http" ? HTTP_FIELDS : []
    const account = n.type === "tool" && n.data.tool === "near_view_account" && typeof n.data.args?.accountId === "string" ? n.data.args.accountId : null
    return fields.map((f) => ({ stepId: n.id, name: f.name, label: f.label, who: account ? accountWho(account, self) : undefined, stepKind: n.type === "http" ? ("http" as const) : ("tool" as const) }))
  })
}

type Results = ReturnType<typeof resultsOf>

function stepOf(n: CanvasNode, mind: string, results: Results, self?: Self): JobStep {
  switch (n.type) {
    case "trigger":
      return { id: n.id, kind: n.type, title: scheduleText(n.data.schedule?.cron), note: `${zoneName(n.data.schedule?.timezone)} time` }
    case "tool":
      if (n.data.tool === "near_view_account" && typeof n.data.args?.accountId === "string") {
        const own = self?.address && n.data.args.accountId.trim() === self.address
        return { id: n.id, kind: n.type, title: own ? `Check ${mind}'s wallet` : `Check ${accountWho(n.data.args.accountId, self)}` }
      }
      return { id: n.id, kind: n.type, title: (TOOL[n.data.tool] ?? (() => "Use a tool"))(n.data.args ?? {}) }
    case "http": {
      let host = "a website"
      try {
        host = new URL(n.data.url).hostname
      } catch {
        // keep "a website"
      }
      return { id: n.id, kind: n.type, title: `Call ${host}` }
    }
    case "condition": {
      const unit = /balance/i.test(n.data.left) ? " NEAR" : ""
      return { id: n.id, kind: n.type, title: `If ${refName(n.data.left)} ${OP[n.data.op] ?? n.data.op} ${String(n.data.right)}${unit}` }
    }
    case "agent": {
      // Earlier results show as chips, as in the Builder.
      return { id: n.id, kind: n.type, title: `${mind} writes you a note`, prompt: promptParts(n.data.prompt.trim(), results) }
    }
    case "end":
      return { id: n.id, kind: n.type, title: "End", note: "The job stops here." }
  }
}

/**
 * A job as a tree (#164): the main line from the trigger, each If with its Yes and No lines, and
 * what follows each If after both ways.
 */
export function jobTree(canvas: Canvas, mind: string, address?: string): JobStep[] {
  const self = address ? { name: mind, address } : undefined
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]))
  const results = resultsOf(canvas, self)
  const seen = new Set<string>()
  const lineFrom = (first: string | undefined): JobStep[] => {
    const out: JobStep[] = []
    let next = first
    while (next && !seen.has(next)) {
      const n = byId.get(next)
      if (!n) break
      seen.add(n.id)
      const step = stepOf(n, mind, results, self)
      const edges = canvas.edges.filter((e) => e.source === n.id)
      if (n.type === "condition") {
        step.then = lineFrom(edges.find((e) => e.sourceHandle === "then")?.target)
        step.else = lineFrom(edges.find((e) => e.sourceHandle === "else")?.target)
      }
      out.push(step)
      next = edges.find((e) => !e.sourceHandle)?.target
    }
    return out
  }
  const trigger = canvas.nodes.find((n) => n.type === "trigger")
  return trigger ? lineFrom(trigger.id) : []
}

/** Every step of a tree, depth first. */
export function flatSteps(tree: JobStep[]): JobStep[] {
  return tree.flatMap((s) => [s, ...flatSteps(s.then ?? []), ...flatSteps(s.else ?? [])])
}

