// What an approval card shows for tools other than send_payment, read from the tool's own
// arguments (engine/src/tools.ts input schemas). A meeting emails other people in the owner's
// name, so its card says who and whether there is a Meet link before the owner approves (#97).

import type { ToolStep } from "@/modules/runs/data/events"

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
    // "Email me" in chat (#225): only ever to the owner's own Gmail.
    case "mail_send_to_owner":
      return {
        title: `Email you "${str(a.subject) ?? "a note"}"`,
        lines: [{ label: "Length", value: `${(str(a.text) ?? "").length.toLocaleString("en")} characters` }],
        note: "It goes from your Mind's own email address to the Gmail you connected, and nobody else.",
      }
    // The track skills' apps (#195 to #200, Axel's #211): what goes where, so the owner approves this exact change.
    case "googledocs_create_document":
      return {
        title: `Write "${str(a.title) ?? "a new Doc"}"`,
        lines: [{ label: "Length", value: `${(str(a.markdown) ?? "").length.toLocaleString("en")} characters` }],
        note: "Creates a new Google Doc in your Drive. Nothing is shared.",
      }
    case "googledocs_append_text": {
      // #247: which Doc (its title as the Mind read it; the engine checks it again before writing), where, and the text.
      const text = str(a.text) ?? ""
      return {
        title: `Add to "${str(a.title) ?? "a Google Doc"}"`,
        lines: [
          { label: "Where", value: "At the end" },
          { label: "Length", value: `${text.length.toLocaleString("en")} characters` },
          { label: "Text", value: text || "Empty" },
        ],
        note: "Adds this text at the end of your Google Doc. Nothing already in it changes. If the Doc has another title when you approve, nothing is added.",
      }
    }
    case "googlesheets_update_cells": {
      // #245: what is in the cells now (as the Mind read them; the engine checks again before writing) and what replaces it.
      const flat = (v: unknown) => (Array.isArray(v) ? v.flat().map((x) => (x === null || x === undefined || x === "" ? "(empty)" : String(x))).join(", ") : "")
      return {
        title: `Change ${str(a.range) ?? "cells"} in your Google Sheet`,
        lines: [
          { label: "Now", value: flat(a.oldValues) || "Not read" },
          { label: "New", value: flat(a.newValues) || "Empty" },
        ],
        note: "Changes only these cells. \"Now\" is what the Mind read; if the cells hold something else when you approve, nothing is changed.",
      }
    }
    case "googlesheets_append_row": {
      const values = Array.isArray(a.values) ? a.values.map((v) => (v === null || v === undefined ? "" : String(v))) : []
      return {
        title: `Add a row to "${str(a.sheet) ?? "a sheet"}"`,
        lines: [{ label: "Row", value: values.length ? values.join(", ") : "Empty" }],
        note: "Adds one row at the end of your Google Sheet. Nothing else changes.",
      }
    }
    case "notion_create_page": {
      // Like a new Doc: say whether the page comes with text, and how much (it can't be edited later).
      const length = (str(a.markdown) ?? "").length
      return {
        title: `Add the page "${str(a.title) ?? "Untitled"}" to Notion`,
        lines: [{ label: "Length", value: length ? `${length.toLocaleString("en")} characters` : "Empty page" }],
        note: "Creates a new page under the one you shared, with this text. Nothing else changes.",
      }
    }
    case "notion_add_row": {
      const props = Array.isArray(a.properties) ? (a.properties as Record<string, unknown>[]) : []
      return {
        title: "Add a row to a Notion database",
        lines: props.slice(0, 8).map((p, i) => ({ label: str(p.name) ?? `${i + 1}`, value: str(p.value) ?? "Empty" })),
        note: "Adds one row. Existing rows don't change.",
      }
    }
    case "slack_send_message":
      return {
        title: `Post to ${str(a.channel)?.replace(/^#?/, "#") ?? "Slack"}`,
        lines: [{ label: "Message", value: str(a.text) ?? "" }],
        note: "Posted to Slack as you.",
      }
    // Zoom (#246): when on the owner's clock, how long, and that nobody is invited (the tool can't invite).
    case "zoom_create_meeting": {
      const minutes = typeof a.minutes === "number" && a.minutes > 0 ? a.minutes : null
      const start = str(a.start) ? Date.parse(a.start as string) : NaN
      const when = whenText(a.start, minutes && !Number.isNaN(start) ? new Date(start + minutes * 60_000).toISOString() : null, timeZone)
      const lines: ApprovalDetails["lines"] = []
      if (when) lines.push({ label: "When", value: when })
      if (minutes) lines.push({ label: "Length", value: `${minutes} ${minutes === 1 ? "minute" : "minutes"}` })
      lines.push({ label: "Guests", value: "Nobody is invited" })
      return {
        title: `Schedule the Zoom meeting "${str(a.topic) ?? "a meeting"}"`,
        lines,
        note: "Creates the meeting in your Zoom with a join link. Nobody is emailed; share the link yourself.",
      }
    }
    case "sell_offer":
      return {
        title: `Sell "${str(a.title) ?? "an offer"}" for ${str(a.priceNear) ?? "?"} NEAR`,
        lines: [{ label: "Item", value: str(a.item) ?? "" }],
        note: "Other Minds can buy it; they pay into this Mind's own wallet.",
      }
    default:
      return null
  }
}
