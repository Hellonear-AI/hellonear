import { api } from "@/lib/api"

// The skill catalog: docs/api-contract.md §7 (`GET /skills`).

/** One skill a Mind may equip (`GET /skills`, engine §2). `description` is written for the model, not people. */
export type ApiSkill = {
  skillId: string
  description: string
  status: "available" | "simulated" | "blocked"
  /** Composio toolkits (`gmail`, `googlecalendar`, `googlemeet`) or `near-wallet`. */
  connections: string[]
  note?: string
  tools: string[]
  /** The name and one line from the SKILL.md (#220), for a skill the FE has no words for yet. */
  title?: string
  blurb?: string
}

/** One skill with its SKILL.md body, the text the Mind reads (`GET /skills/{skillId}`, #220). */
export type ApiSkillDetail = Pick<ApiSkill, "skillId" | "status" | "connections" | "tools" | "title" | "blurb"> & { markdown: string }

export const skillsApi = {
  skills: async () => (await api<{ skills: ApiSkill[] }>("/skills")).skills,
  skill: async (skillId: string) => (await api<{ skill: ApiSkillDetail }>(`/skills/${encodeURIComponent(skillId)}`)).skill,
}
