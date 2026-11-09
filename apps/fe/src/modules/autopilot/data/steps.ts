// A job's steps in plain words (design P1.1 "Steps"), read from its saved canvas in run order.
// No code, no ids: "Check 7a1c90e2…a84f3b", "If the balance is under 5 NEAR".

import type { Canvas, CanvasNode } from "@/modules/autopilot/api"
import { scheduleText, zoneName } from "@/modules/autopilot/data/schedule"
import { shortAddress } from "@/modules/wallet/data/address"

export type JobStep = { id: string; kind: CanvasNode["type"]; title: string; note?: string; branch?: "then" | "else" }

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
}

function stepOf(n: CanvasNode, mind: string): JobStep {
  switch (n.type) {
    case "trigger":
      return { id: n.id, kind: n.type, title: scheduleText(n.data.schedule?.cron), note: `${zoneName(n.data.schedule?.timezone)} time` }
    case "tool":
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
      const p = n.data.prompt.replace(/\{\{[^}]*\}\}/g, "...").trim()
      return { id: n.id, kind: n.type, title: `${mind} writes you a note`, note: p.length > 90 ? `${p.slice(0, 90)}...` : p }
    }
  }
}

/** Steps in run order: the chain from the trigger, then the condition's yes and no endings. */
export function jobSteps(canvas: Canvas, mind: string): JobStep[] {
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]))
  const out: JobStep[] = []
  let at: CanvasNode | undefined = canvas.nodes.find((n) => n.type === "trigger")
  const seen = new Set<string>()
  while (at && !seen.has(at.id)) {
    const here: CanvasNode = at
    seen.add(here.id)
    out.push(stepOf(here, mind))
    if (here.type === "condition") {
      for (const handle of ["then", "else"] as const) {
        const e = canvas.edges.find((x) => x.source === here.id && x.sourceHandle === handle)
        const t = e && byId.get(e.target)
        if (t) out.push({ ...stepOf(t, mind), branch: handle })
      }
      break
    }
    const next: Canvas["edges"][number] | undefined = canvas.edges.find((x) => x.source === here.id)
    at = next ? byId.get(next.target) : undefined
  }
  return out
}
