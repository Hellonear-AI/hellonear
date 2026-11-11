import { ApiError } from "@/lib/api"
import { shortWhen } from "@/lib/format"

/**
 * A day label before a turn, only where it tells something: when the day changes inside the
 * thread, or at the top of a thread from another day. A chat from today has none.
 */
export function dayLabel(at: string, previous: string | null, now: Date = new Date()): string | null {
  const day = shortWhen(at, now)
  const shown = day === "Today" || day === "Yesterday" ? day : longDay(at, now)
  if (previous === null) return day === "Today" ? null : shown
  return day === shortWhen(previous, now) ? null : shown
}

/**
 * The day spelled out above a turn: "Monday, 9 Nov", with the year when it isn't this one. Recent
 * chats keeps the short "Mon", but alone above a chat it read like a code (Ancung, 11 Nov).
 */
function longDay(iso: string, now: Date): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" })
  const rest = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) })
  return `${weekday}, ${rest}`
}

export function failureText(name: string, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "demo_run_limit") return `That's all the messages this try-out has. Connect a wallet to keep chatting with ${name}.`
    if (error.code === "demo_rate_limited") return "Too many messages from this network. Please try again in a few minutes."
    if (error.status === 401) return "Your session ended. Sign in again to keep chatting."
    if (error.status >= 500) return `${name} could not answer. The AI service didn't respond, so nothing happened.`
    return `${name} could not answer. Nothing happened.`
  }
  if (error === "no_reply") return `${name} thought about it but didn't write a reply. Try asking again.`
  // A string is a run.error from the stream: the message was stored before the run broke.
  if (typeof error === "string") return `${name} could not answer. The AI service stopped partway. Your message is saved and nothing else happened.`
  return `${name} could not answer. The connection dropped, so check yours and try again.`
}
