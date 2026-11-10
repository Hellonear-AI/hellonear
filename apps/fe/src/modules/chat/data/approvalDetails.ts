// What an approval card shows for tools other than send_payment, read from the tool's own
// arguments (engine/src/tools.ts input schemas). A meeting emails other people in the owner's
// name, so its card says who and whether there is a Meet link before the owner approves (#97).

import type { ToolStep } from "@/modules/chat/data/events"

export type ApprovalDetails = { title: string; lines: { label: string; value: string }[]; note?: string }

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [])

/** "Tue 11 Nov, 14:00 to 15:00", or the end's date too when it falls on another day. */
export function whenText(start: unknown, end: unknown, timeZone?: string): string | null {
  const s = str(start) ? new Date(start as string) : null
  if (!s || Number.isNaN(s.getTime())) return null
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone })
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone })
  const from = `${day.format(s)}, ${time.format(s)}`
  const e = str(end) ? new Date(end as string) : null
  if (!e || Number.isNaN(e.getTime())) return from
  return day.format(e) === day.format(s) ? `${from} to ${time.format(e)}` : `${from} to ${day.format(e)}, ${time.format(e)}`
}

export function approvalDetails(step: ToolStep, timeZone?: string): ApprovalDetails | null {
  const a = (step.args ?? {}) as Record<string, unknown>
  switch (step.tool) {
    case "googlecalendar_create_event": {
      const when = whenText(a.start, a.end, timeZone)
      const lines = [when && { label: "When", value: when }, str(a.location) && { label: "Where", value: str(a.location)! }]
      return { title: `Add "${str(a.title) ?? "an event"}" to your calendar`, lines: lines.filter((l) => !!l) as ApprovalDetails["lines"] }
    }
    case "googlecalendar_create_meeting": {
      const guests = list(a.attendees)
      const when = whenText(a.start, a.end, timeZone)
      const lines: ApprovalDetails["lines"] = []
      if (when) lines.push({ label: "When", value: when })
      lines.push({ label: "Guests", value: guests.length ? guests.join(", ") : "No guests" })
      lines.push({ label: "Video", value: a.meet === true ? "A Google Meet link" : "No video link" })
      if (str(a.location)) lines.push({ label: "Where", value: str(a.location)! })
      return {
        title: `Schedule "${str(a.title) ?? "a meeting"}"`,
        lines,
        // Say where it lands: the tool adds an event to the owner's own calendar (#97).
        note: guests.length
          ? `Adds it to your Google Calendar, and Google emails ${guests.length === 1 ? "this guest" : "each guest"} an invite in your name.`
          : "Adds it to your Google Calendar.",
      }
    }
    case "gmail_organize": {
      // #106: the card lists every email, as the Mind listed them, so the owner approves exactly this batch.
      const emails = Array.isArray(a.emails) ? (a.emails as Record<string, unknown>[]) : []
      const what = a.action === "label" ? `Label ${emails.length} ${emails.length === 1 ? "email" : "emails"} "${str(a.label) ?? ""}"` : a.action === "label_and_archive" ? `Label ${emails.length} ${emails.length === 1 ? "email" : "emails"} "${str(a.label) ?? ""}" and archive them` : `Archive ${emails.length} ${emails.length === 1 ? "email" : "emails"}`
      return {
        title: what,
        // Numbered rows, "Sender: subject", with the sender's name only: the card's label column is narrow, and two
        // emails from one sender must not share a row key.
        lines: emails.map((e, i) => {
          const from = str(e.from)?.replace(/\s*<[^>]*>\s*$/, "").replace(/^"|"$/g, "") || str(e.from) || "Unknown sender"
          return { label: `${i + 1}`, value: `${from}: ${str(e.subject) ?? "(no subject)"}` }
        }),
        note: a.action === "label"
          ? `Adds the label in your Gmail; ${emails.length === 1 ? "it stays" : "they stay"} in your inbox.`
          : `Takes ${emails.length === 1 ? "it" : "them"} out of your inbox; ${emails.length === 1 ? "it stays" : "they stay"} in All Mail. Nothing is deleted.`,
      }
    }
    case "mail_send": {
      const to = list(a.to)
      return {
        title: `Send "${str(a.subject) ?? "an email"}"`,
        lines: [{ label: "To", value: to.length ? to.join(", ") : "Nobody yet" }],
        note: "It goes from your Mind's own email address.",
      }
    }
    default:
      return null
  }
}
