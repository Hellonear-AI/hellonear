import { z } from "zod"
import type { ApiTemplate } from "@/modules/minds/api"

// What the Choose a Mind screen (L2) adds on top of GET /v1/templates: the card order,
// short chip labels for skills, and the name rule.

/** The design's card order. Templates the app doesn't know yet go last, in API order. */
const ORDER = ["general-assistant", "payments-mind", "email-manager"]

/** A template id the landing page may send in `/minds/new?template=` (its Choose buttons); anything else is ignored. */
export const isKnownTemplate = (id: string | null | undefined): id is string => Boolean(id && ORDER.includes(id))

export function sortTemplates(templates: ApiTemplate[]): ApiTemplate[] {
  const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length)
  return [...templates].sort((a, b) => rank(a.templateId) - rank(b.templateId))
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
