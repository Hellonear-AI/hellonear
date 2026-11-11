import { api } from "@/lib/api"

// What a Mind remembers about its owner (#209, docs/api-contract.md §7): the engine's working
// memory for the Mind's current name and voice. Try-out users can read it; PUT and DELETE answer
// `403 demo_not_allowed` for them.

export type ApiMemory = {
  /** Free Markdown the Mind writes itself; "" when there is nothing yet or it was cleared. */
  markdown: string
  /** When the whole document last changed; null when it is empty. */
  updatedAt: string | null
}

/** The engine's cap on the document, checked by the backend too. */
export const MEMORY_MAX_CHARS = 20_000

const path = (mindId: string) => `/minds/${encodeURIComponent(mindId)}/memory`

export const memoryApi = {
  get: async (mindId: string) => (await api<{ memory: ApiMemory }>(path(mindId))).memory,
  /** Replaces the whole document with the owner's edit. */
  replace: async (mindId: string, markdown: string) =>
    (await api<{ memory: ApiMemory }>(path(mindId), { method: "PUT", body: { markdown } })).memory,
  /** Clears it for good (`204`). Past chats stay. */
  clear: async (mindId: string) => api<void>(path(mindId), { method: "DELETE" }),
}
