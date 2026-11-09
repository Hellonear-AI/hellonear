// What a block shows after a Test run (design B1.2): a few words from its node.finished output.

export type NodeRun = { status: "running" | "ok" | "error"; note?: string }

const cut = (s: string) => (s.length > 120 ? `${s.slice(0, 120)}...` : s)

export function nodeSummary(output: unknown): string {
  if (typeof output === "string") return cut(output.trim()) || "Done"
  if (!output || typeof output !== "object") return "Done"
  const o = output as Record<string, unknown>
  if (typeof o.text === "string" && o.text.trim()) return cut(o.text.trim())
  if (typeof o.balanceNear === "number" || typeof o.balanceNear === "string") return `Balance ${o.balanceNear} NEAR`
  if (typeof o.weekday === "string" && typeof o.time === "string") return `${o.weekday}, ${o.time}`
  if (Array.isArray(o.events)) return `${o.events.length} ${o.events.length === 1 ? "event" : "events"}`
  if (Array.isArray(o.emails)) return `${o.emails.length} ${o.emails.length === 1 ? "email" : "emails"}`
  if (typeof o.status === "number") return `Answered ${o.status}`
  return "Done"
}
