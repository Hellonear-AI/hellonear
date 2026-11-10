// The comparisons an If can make, and the title its card shows.

import { stepFields, type IfBlock, type Op, type Step } from "@/modules/builder/data/draft"

export const OPS: { op: Op; label: string; number?: boolean }[] = [
  { op: "eq", label: "is" },
  { op: "ne", label: "is not" },
  { op: "lt", label: "less than", number: true },
  { op: "lte", label: "at most", number: true },
  { op: "gt", label: "more than", number: true },
  { op: "gte", label: "at least", number: true },
]

export function ifTitle(b: IfBlock, steps: Step[]): string {
  const field = stepFields(steps.find((s) => s.id === b.stepId)).find((f) => f.name === b.field)
  if (!field || !b.right.trim()) return "Pick what to check"
  // "If balance is less than 5 NEAR", "If weekday is Friday", "If weekday is not Sunday".
  const label = OPS.find((o) => o.op === b.op)?.label ?? b.op
  const verb = label.startsWith("is") ? label : `is ${label}`
  const what = field.label.replace(/ \(.*\)$/, "").toLowerCase()
  return `If ${what} ${verb} ${b.right.trim()}${field.name === "balanceNear" ? " NEAR" : ""}`
}
