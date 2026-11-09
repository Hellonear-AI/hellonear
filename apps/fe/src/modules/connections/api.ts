import { api } from "@/lib/api"
import type { ApiConnection } from "@/modules/minds/api"

// Secrets (#18) and app connections (#13): docs/api-contract.md §7. Account level, not per Mind.

/** A saved key, never with its value. */
export type ApiSecret = { name: string; allowedHosts: string[]; createdAt: string; updatedAt: string }

export const connectionsApi = {
  secrets: async () => (await api<{ secrets: ApiSecret[] }>("/secrets")).secrets,
  /** Add or replace a key (same name replaces). */
  putSecret: async (name: string, body: { value: string; allowedHosts: string[] }) =>
    (await api<{ secret: ApiSecret }>(`/secrets/${encodeURIComponent(name)}`, { method: "PUT", body })).secret,
  deleteSecret: (name: string) => api<void>(`/secrets/${encodeURIComponent(name)}`, { method: "DELETE" }),
  /** Composio deletes the connection and its tokens; 404 if there was none. */
  disconnect: (toolkit: ApiConnection["toolkit"]) => api<void>(`/connections/${toolkit}`, { method: "DELETE" }),
}
