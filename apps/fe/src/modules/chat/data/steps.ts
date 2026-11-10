// How a tool step reads in the chat (Ancung, 9 Nov: the Mind's work shows in the reply itself,
// not in a separate live view): what it is doing ("Checking the balance..."), what it did
// ("Checked the balance") with a short result ("4.79 NEAR"), or that it didn't work.
// No "·" separators: the result is set apart by its colour.

import { formatNear } from "@/lib/format"
import type { ToolStep } from "@/modules/chat/data/events"
import { TOOLS, type StepOrb } from "@/modules/chat/data/tools"
import { skillCopy } from "@/modules/skills/data/skills"


/** Plain words for what a tool is doing (an approval card's title); unknown tools get a neutral line. */
export function toolLabel(tool: string): string {
  return TOOLS[tool]?.doing ?? "Using a tool"
}



export type { StepOrb }

/** Which orb a running step shows; waiting for the owner listens. */
export function stepOrb(step: Pick<ToolStep, "tool" | "status">): StepOrb {
  // Waiting for the owner: a waveform rolling, as if listening.
  if (step.status === "awaiting_approval") return "listening"
  return TOOLS[step.tool]?.orb ?? "working"
}

export type StepText = { label: string; detail: string | null; tone: "doing" | "done" | "failed" | "stopped" }

export function stepText(step: ToolStep): StepText {
  const { doing, done } = TOOLS[step.tool] ?? { doing: "Using a tool", done: "Used a tool" }
  if (step.status === "running" || step.status === "awaiting_approval") return { label: `${doing}...`, detail: null, tone: "doing" }
  if (step.status === "ok") return { label: done, detail: summary(step), tone: "done" }
  if (step.status === "declined") return { label: doing, detail: "you declined", tone: "failed" }
  if (step.status === "stopped") return { label: doing, detail: "stopped", tone: "stopped" }
  return { label: doing, detail: "failed", tone: "failed" }
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
    case "gmail_organize": {
      // #106: "4 archived", "3 labelled Newsletters", or what failed. A try-out's sample inbox never changes.
      if (r.source === "sample_inbox") return "sample inbox, nothing changed"
      const done = typeof r.done === "number" ? r.done : 0
      const verb = r.action === "label" ? `labelled ${text(r.label) ?? ""}`.trim() : r.action === "label_and_archive" ? `labelled ${text(r.label) ?? ""} and archived` : "archived"
      const failed = Array.isArray(r.failed) && r.failed.length ? `, ${r.failed.length} failed` : ""
      return `${done} ${verb}${failed}`
    }
    case "gmail_create_draft":
      return text(r.to) ? `to ${r.to}` : null
    case "googlecalendar_list_events":
      return count(r.events, "event", "events")
    case "googlecalendar_create_event":
      return text(r.title)
    case "googlecalendar_create_meeting":
      // Who was invited matters more than the title here: Google emailed them.
      return Array.isArray(r.attendees) && r.attendees.length
        ? `${text(r.title) ?? "Meeting"}, ${r.attendees.length} ${r.attendees.length === 1 ? "guest" : "guests"} invited`
        : text(r.title)
    case "buy_data":
      if (r.status === "paid") return "bought, report received"
      if (r.status === "payment_required") return text(r.priceNear) ? `price ${r.priceNear} NEAR` : "price asked"
      return r.status === "refused" ? "not sold" : null
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

/** "8s", "1m 05s": short and plain, for step rows and the summary. */
export function duration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000))
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  return `${m}m ${String(total % 60).padStart(2, "0")}s`
}

/** How long a finished step took, from its own call and result times. */
export function stepDuration(step: ToolStep): string | null {
  if (!step.startedAt || !step.endedAt || step.status === "declined") return null
  const ms = new Date(step.endedAt).getTime() - new Date(step.startedAt).getTime()
  return Number.isFinite(ms) ? duration(ms) : null
}

/**
 * The one line a finished reply's steps fold into (Ancung, 9 Nov, like Claude): how long the Mind
 * worked in all (not only how long it thought), then how many steps it used.
 */
export function summaryLabel(steps: number, workMs: number): string {
  const worked = `Worked for ${duration(workMs)}`
  return steps > 0 ? `${worked}, used ${steps} ${steps === 1 ? "step" : "steps"}` : worked
}
