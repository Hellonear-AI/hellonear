// One line per job run (design P1.1 "Runs"): what the Mind wrote, else what the last step found,
// else what went wrong and where. Read from GET …/runs (`nodes`, in run order).

import type { WorkflowRun } from "@/modules/autopilot/api"

const cut = (s: string) => (s.length > 160 ? `${s.slice(0, 160)}...` : s)

function textOf(output: unknown): string | null {
  if (typeof output === "string") return output.trim() || null
  if (output && typeof output === "object" && typeof (output as { text?: unknown }).text === "string") return ((output as { text: string }).text.trim() || null)
  return null
}

export function runSummary(run: WorkflowRun, name: string): string | null {
  const failed = run.nodes.find((n) => n.status === "error")
  if (failed) return cut(`A step didn't work: ${(failed.error ?? "no reason given").replace(/^\w*Error:\s*/, "")}`)
  const wrote = [...run.nodes].reverse().find((n) => n.nodeType === "agent" && textOf(n.output))
  if (wrote) return cut(textOf(wrote.output)!)
  const balance = run.nodes.find((n) => n.output && typeof (n.output as { balanceNear?: unknown }).balanceNear !== "undefined")
  if (balance && run.status === "success") return `Balance ${String((balance.output as { balanceNear: unknown }).balanceNear)} NEAR, no note needed`
  if (run.status === "running") return null
  if (run.status === "success") return `${name} finished every step.`
  return null
}
