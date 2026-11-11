// How the wallet's payments read (design W1 Recent activity and W5), from GET …/wallet/payments.
// Money coming in isn't in that list (it only records what the Mind tried to send), so
// "Added by you" rows from the design can't show yet. No "·" separators (Ancung, 9 Nov).

import { clockTime, formatNear, shortWhen } from "@/lib/format"
import { compareNear } from "@/lib/near"
import type { ApiPayment } from "@/modules/wallet/api"

export type ActivityFilter = "all" | "sent" | "blocked"

export type ActivityLine = {
  title: string
  note: string
  amount: string
  tone: "sent" | "blocked" | "failed" | "waiting"
  badge: string
}

export function activityLine(p: ApiPayment, now: Date = new Date()): ActivityLine {
  const amount = `${formatNear(p.amountNear)} NEAR`
  const when = `${shortWhen(p.at, now)}, ${clockTime(p.at)}`
  switch (p.status) {
    case "sent":
      return { title: `Paid ${p.to}`, note: when, amount: `−${amount}`, tone: "sent", badge: "Sent" }
    case "policy_denied":
      return { title: `Tried ${amount} to ${p.to}`, note: `${when}, your limits stopped it`, amount, tone: "blocked", badge: "Blocked" }
    case "wallet_frozen":
      return { title: `Tried ${amount} to ${p.to}`, note: `${when}, the wallet was frozen`, amount, tone: "blocked", badge: "Blocked" }
    case "pending":
      return { title: `Paying ${p.to}`, note: when, amount, tone: "waiting", badge: "Waiting" }
    default:
      return { title: `${amount} to ${p.to} didn't go through`, note: `${when}, nothing was sent`, amount, tone: "failed", badge: "Failed" }
  }
}

export function filterActivity(payments: ApiPayment[], filter: ActivityFilter): ApiPayment[] {
  if (filter === "sent") return payments.filter((p) => p.status === "sent")
  if (filter === "blocked") return payments.filter((p) => p.status === "policy_denied" || p.status === "wallet_frozen")
  return payments
}

/**
 * "Spent today" (W1): what was sent since 00:00 UTC, the day OutLayer's daily cap counts (#149: James measured the cap
 * resetting at 00:00 UTC, not after a rolling 24 h). Local midnight read wrong between 00:00 UTC and local midnight.
 */
export function spentToday(payments: ApiPayment[], now: Date = new Date()): { total: string; count: number } {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const today = payments.filter((p) => p.status === "sent" && new Date(p.at).getTime() >= midnight)
  return { total: addNear(today.map((p) => p.amountNear)), count: today.length }
}

/** Add decimal NEAR strings exactly (24 decimals), e.g. ["1.5", "2"] -> "3.5". */
export function addNear(amounts: string[]): string {
  let total = BigInt(0)
  for (const a of amounts) {
    const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(a.trim())
    if (m) total += BigInt(m[1] + (m[2] ?? "").padEnd(24, "0"))
  }
  const digits = total.toString().padStart(25, "0")
  const frac = digits.slice(-24).replace(/0+$/, "")
  const whole = digits.slice(0, -24)
  const out = frac ? `${whole}.${frac}` : whole
  return compareNear(out, "0") === 0 ? "0" : out
}

/** `a - b` for decimal NEAR strings, exactly; never below "0". */
export function subNear(a: string, b: string): string {
  const yocto = (v: string) => {
    const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(v.trim())
    return m ? BigInt(m[1] + (m[2] ?? "").padEnd(24, "0")) : BigInt(0)
  }
  const d = yocto(a) - yocto(b)
  if (d <= BigInt(0)) return "0"
  const digits = d.toString().padStart(25, "0")
  const frac = digits.slice(-24).replace(/0+$/, "")
  const whole = digits.slice(0, -24)
  return frac ? `${whole}.${frac}` : whole
}

/** When the UTC day starts on this device's clock, e.g. "07:00" in Jakarta. */
export function utcMidnightLocal(now: Date = new Date(), timeZone?: string): string {
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(midnight)
}
