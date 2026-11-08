import { z } from "zod"
import type { ApiTemplate } from "@/modules/minds/api"

// What the Choose a Mind screen (L2) adds on top of GET /v1/templates: the card order,
// a suggested name per template, short chip labels for skills, and the name rule.

/** The design's card order. Templates the app doesn't know yet go last, in API order. */
const ORDER = ["general-assistant", "payments-mind", "email-manager"]

export function sortTemplates(templates: ApiTemplate[]): ApiTemplate[] {
  const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length)
  return [...templates].sort((a, b) => rank(a.templateId) - rank(b.templateId))
}

/** Filled into the name field when a template is picked; the user can change it. */
const SUGGESTED_NAME: Record<string, string> = {
  "general-assistant": "Ava",
  "payments-mind": "Penny",
  "email-manager": "Iris",
}

export function suggestedName(templateId: string): string {
  return SUGGESTED_NAME[templateId] ?? ""
}

/** Skill descriptions in the API are written for the model, so the cards use short labels. */
const SKILL_LABEL: Record<string, string> = {
  payments: "Payments",
  "daily-planner": "Plan your day",
  "email-triage": "Read email",
}

export function skillLabels(template: ApiTemplate): string[] {
  return template.skills.flatMap((s) => (SKILL_LABEL[s.skillId] ? [SKILL_LABEL[s.skillId]] : []))
}

/** The rule shown under the name field (L2.3). The backend allows 1 to 64 characters; this is stricter. */
export const NAME_RULE = "Use 2 to 24 letters or numbers."

export const mindNameSchema = z.string().trim().regex(/^[\p{L}\p{N}]{2,24}$/u, NAME_RULE)

export function isValidMindName(name: string): boolean {
  return mindNameSchema.safeParse(name).success
}
