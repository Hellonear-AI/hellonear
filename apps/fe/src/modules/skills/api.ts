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
}

export const skillsApi = {
  skills: async () => (await api<{ skills: ApiSkill[] }>("/skills")).skills,
}
