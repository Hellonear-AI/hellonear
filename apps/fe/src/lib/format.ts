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

/** A clock time for chat messages, in the viewer's own format ("10:42"). */
export function clockTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

/** A testnet transaction on NearBlocks (the explorer docs.near.org links for testnet; checked 9 Nov). */
export function explorerTxUrl(txHash: string): string {
  return `https://testnet.nearblocks.io/txns/${encodeURIComponent(txHash)}`
}

/** "just now", "12 min ago", "3 h ago", then the day (`shortWhen`). For approval requests. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ""
  const min = Math.floor(ms / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  return shortWhen(iso, now)
}
