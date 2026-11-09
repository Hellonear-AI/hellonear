// How a tool step reads in the chat (Ancung, 9 Nov: the Mind's work shows in the reply itself,
// not in a separate live view): what it is doing ("Checking the balance..."), what it did
// ("Checked the balance") with a short result ("4.79 NEAR"), or that it didn't work.
// No "·" separators: the result is set apart by its colour.

import { formatNear } from "@/lib/format"
import type { ToolStep } from "@/modules/chat/data/events"
import { skillCopy } from "@/modules/skills/data/skills"

const LABELS: Record<string, [doing: string, done: string]> = {
  get_balance: ["Checking the balance", "Checked the balance"],
  list_payments: ["Looking at past payments", "Looked at past payments"],
  send_payment: ["Sending a payment", "Sent a payment"],
  near_view_account: ["Looking up a NEAR account", "Looked up"],
  http_request: ["Calling a website", "Called a website"],
  get_time: ["Checking the time", "Checked the time"],
  gmail_list_emails: ["Reading your inbox", "Read your inbox"],
  gmail_read_email: ["Reading an email", "Read an email"],
  gmail_create_draft: ["Saving a draft in Gmail", "Saved a draft in Gmail"],
  googlecalendar_list_events: ["Checking your calendar", "Checked your calendar"],
  googlecalendar_create_event: ["Adding to your calendar", "Added to your calendar"],
  skill: ["Picking up a skill", "Picked up a skill"],
  skill_read: ["Picking up a skill", "Picked up a skill"],
  skill_search: ["Looking for a skill", "Looked for a skill"],
}

export type StepText = { label: string; detail: string | null; tone: "doing" | "done" | "failed" }

export function stepText(step: ToolStep): StepText {
  const [doing, done] = LABELS[step.tool] ?? ["Using a tool", "Used a tool"]
  if (step.status === "running" || step.status === "awaiting_approval") return { label: `${doing}...`, detail: null, tone: "doing" }
  if (step.status === "ok") return { label: done, detail: summary(step), tone: "done" }
  if (step.status === "declined") return { label: doing, detail: "you declined", tone: "failed" }
  return { label: doing, detail: "didn't work", tone: "failed" }
}

const count = (n: unknown, one: string, many: string) => (Array.isArray(n) ? `${n.length} ${n.length === 1 ? one : many}` : null)
const text = (v: unknown) => (typeof v === "string" && v ? v : null)

/** A few words from the tool's result (engine/src/tools.ts output schemas), or null. */
function summary(step: ToolStep): string | null {
  const r = (step.result ?? {}) as Record<string, unknown>
  const a = (step.args ?? {}) as Record<string, unknown>
  switch (step.tool) {
    case "get_balance":
      return text(r.balanceNear) ? `${formatNear(r.balanceNear as string)} NEAR` : null
    case "list_payments":
      return count(r.payments, "payment", "payments")
    case "near_view_account":
      return text(r.accountId) ?? text(a.accountId)
    case "http_request": {
      // Which site, the useful part (Ancung, 9 Nov: "it answered" said nothing).
      let host: string | null = null
      try {
        host = typeof a.url === "string" ? new URL(a.url).hostname : null
      } catch {
        host = null
      }
      if (typeof r.status === "number" && r.status >= 400) return host ? `${host} returned an error` : "it returned an error"
      return host
    }
    case "gmail_list_emails":
      return count(r.emails, "email", "emails")
    case "gmail_read_email":
      return text(r.subject)
    case "gmail_create_draft":
      return text(r.to) ? `to ${r.to}` : null
    case "googlecalendar_list_events":
      return count(r.events, "event", "events")
    case "googlecalendar_create_event":
      return text(r.title)
    case "skill":
    case "skill_read": {
      // The skill's name people know ("Daily planner"), not its id ("daily-planner").
      const id = text(a.name) ?? text(a.skillName)
      return id ? skillCopy(id).title : null
    }
    default:
      return null
  }
}
