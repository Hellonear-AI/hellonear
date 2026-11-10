// Skills grouped by what they're for (Ancung, 11 Nov: 32 skills in one list were too many). The
// groups follow the tracks we submit to (#194) where they can: money (agents, business, swarms),
// safety (security), privacy. Order inside a group is the order on the page.

export type CategoryId = "money" | "safety" | "privacy" | "mail" | "apps"

export const CATEGORIES: { id: CategoryId; label: string; skills: string[] }[] = [
  {
    id: "money",
    label: "Money",
    skills: ["payments", "best-price", "price-watch", "split-bill", "revenue-split", "invoice", "mind-seller", "paid-data", "subscriptions"],
  },
  {
    id: "safety",
    label: "Safety",
    skills: ["recipient-guard", "phishing-detector", "freeze-advisor", "spending-audit", "treasury-report"],
  },
  { id: "privacy", label: "Privacy", skills: ["confidential-reader", "redact-before-send", "health-journal"] },
  {
    id: "mail",
    label: "Email & calendar",
    skills: [
      "email-triage",
      "email-address",
      "outlook",
      "daily-planner",
      "morning-briefing",
      "meeting-prep",
      "calendar-conflicts",
      "follow-ups",
      "spending-tracker",
    ],
  },
  { id: "apps", label: "Apps & tools", skills: ["docs", "sheets", "notion", "slack", "near-account", "http-request"] },
]

/** A skill's group; one the FE doesn't place yet goes with Apps & tools. */
export function categoryOf(skillId: string): CategoryId {
  return CATEGORIES.find((c) => c.skills.includes(skillId))?.id ?? "apps"
}

/** Skills in page order: by group, then by their place in it; unknown ones last. */
export function byCategory<T extends { skillId: string }>(skills: T[]): { id: CategoryId; label: string; skills: T[] }[] {
  return CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    skills: skills
      .filter((s) => categoryOf(s.skillId) === c.id)
      .sort((a, b) => {
        const ia = c.skills.indexOf(a.skillId)
        const ib = c.skills.indexOf(b.skillId)
        return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib)
      }),
  })).filter((c) => c.skills.length > 0)
}
