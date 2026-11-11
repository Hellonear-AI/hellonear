// What a block shows after a Test run (design B1.2): a few words from its node.finished output.

import { allBlocks, type Block } from "@/modules/builder/data/draft"

export type NodeRun = { status: "running" | "ok" | "error"; note?: string }

/** A Test run in progress or done: each block's state, the job's status, and whether it started. */
export type TestState = { running: boolean; nodes: Record<string, NodeRun>; status: string | null; failed: boolean }

/** A finished Test run went wrong: it didn't start, or the job failed. */
export const wentWrong = (t: TestState) => t.failed || t.status === "failed"

/** A Test run that finished and went well. */
export const finishedWell = (t: TestState | null) => Boolean(t && !t.running && !wentWrong(t))

/**
 * Conditions send no events (§3): the If lights up from the ending that ran, or, once a run ended
 * well with its checked step done and no ending run, from the "stop" it took.
 */
export function withIf(nodes: Record<string, NodeRun>, line: Block[], finished: boolean): Record<string, NodeRun> {
  const out = { ...nodes }
  for (const b of allBlocks(line)) {
    if (b.kind !== "if") continue
    const took = (["then", "else"] as const).find((h) => allBlocks(b[h]).some((x) => nodes[x.id]))
    if (took) out[b.id] = { status: "ok", note: took === "then" ? "Yes" : "No" }
    else if (finished && nodes[b.stepId]?.status === "ok") out[b.id] = { status: "ok", note: "Carried on" }
  }
  return out
}

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
  // Add to my calendar and Email me (#146). Try-outs get samples: say nothing was really added or sent.
  const time = (iso: unknown) => (typeof iso === "string" ? iso.slice(11, 16) : "")
  if (o.status === "created" && typeof o.title === "string") return o.source === "sample_calendar" ? `Sample only: "${o.title}" at ${time(o.start)} was not added to a real calendar` : `Added "${o.title}" at ${time(o.start)} to your calendar`
  if (typeof o.sendId === "string") {
    if (o.sample === true) return "Sample only: no email was sent"
    if (o.status === "sent") return `Emailed you at ${Array.isArray(o.to) ? o.to.join(", ") : "your Gmail"}`
    return `Not sent: ${typeof o.message === "string" ? o.message : String(o.status)}`
  }
  return "Done"
}
