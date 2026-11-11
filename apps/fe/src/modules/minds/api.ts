import { api } from "@/lib/api"

// Templates, Minds, their runs and threads: docs/api-contract.md §7. A Mind's wallet and approvals
// are in wallet/api.ts, the skill catalog in skills/api.ts, app connections in connections/api.ts.

export type ApiMind = {
  id: string
  templateId: string
  name: string
  soul: { identity: string; invariants: string[]; priors: string[] }
  model: string
  skills: string[]
  outlayerWalletId: string | null
  /** Memory switches (#209): working memory and search of past chats. Both on by default. */
  memory?: { enabled: boolean; recall: boolean }
  createdAt: string
  updatedAt: string
}

export type ApiTemplate = {
  templateId: string
  name: string
  tagline: string
  /** One line in the Mind's own voice, at most 80 characters (#55). */
  quote: string
  /** The NEAR AI model the template starts with (docs/api-contract.md, GET /v1/templates). */
  model: string
  skills: { skillId: string; description: string; status: "available" | "simulated" | "blocked" }[]
}

export type ApiThread = {
  threadId: string
  /** First user message cut to ~60 characters, or null for old threads. */
  title: string | null
  lastMessageAt: string
  messageCount: number
}

export const mindsApi = {
  templates: async () => (await api<{ templates: ApiTemplate[] }>("/templates")).templates,
  /** Soul, model and skills come from the template. */
  create: async (body: { templateId: string; name: string }) =>
    (await api<{ mind: ApiMind }>("/minds", { method: "POST", body })).mind,
  list: async () => (await api<{ minds: ApiMind[] }>("/minds")).minds,
  /** Change a Mind's name, persona, model or skills; the backend re-sends it to every Autopilot job. */
  update: async (mindId: string, body: Partial<Pick<ApiMind, "name" | "soul" | "model" | "skills">> & { memory?: { enabled?: boolean; recall?: boolean } }) =>
    (await api<{ mind: ApiMind }>(`/minds/${encodeURIComponent(mindId)}`, { method: "PATCH", body })).mind,
  /**
   * Delete a Mind, its chats, memory and Autopilot jobs (`204`). While its own wallet holds more
   * than 0.001 NEAR the backend answers `409 wallet_not_empty` with `balanceNear` (#163): deleting
   * removes the wallet's only key, so nobody could move that NEAR again. `acknowledgeBalance`
   * confirms the owner saw that.
   */
  remove: async (mindId: string, acknowledgeBalance = false) =>
    api<void>(`/minds/${encodeURIComponent(mindId)}${acknowledgeBalance ? "?acknowledgeBalance=true" : ""}`, { method: "DELETE" }),
  /** A Mind's runs, newest first (chat runs, builder runs; a resumed run is the same run). */
  runs: async (mindId: string, limit = 20) =>
    (await api<{ runs: { runId: string }[] }>(`/minds/${encodeURIComponent(mindId)}/runs?limit=${limit}`)).runs,
  threads: async (mindId: string, limit = 20) =>
    (await api<{ threads: ApiThread[] }>(`/minds/${encodeURIComponent(mindId)}/threads?limit=${limit}`)).threads,
}
