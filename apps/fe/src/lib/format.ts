// Small display helpers shared across screens.

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A short "when" for lists like Recent chats: "Today", "Yesterday", a weekday within the last
 * week ("Mon"), otherwise a date ("7 Nov"). Uses the viewer's local calendar days.
 */
export function shortWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(date)) / DAY_MS)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return date.toLocaleDateString("en-GB", { weekday: "short" })
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

/**
 * A NEAR amount for display: two decimals, rounded down so a balance is never shown higher
 * than it is ("0.979910726975" -> "0.97", "42" -> "42.00"). Works on the decimal string, no floats.
 */
export function formatNear(amount: string): string {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(amount.trim())
  if (!match) return amount
  const whole = match[1].replace(/^0+(?=\d)/, "")
  const cents = (match[2] ?? "").padEnd(2, "0").slice(0, 2)
  return `${Number(whole).toLocaleString("en-US")}.${cents}`
}
