import { api } from "@/lib/api"

// Secrets (#18) and app connections (#13): docs/api-contract.md §7. Account level, not per Mind.

/** An app the account connects through Composio (Gmail, Google Calendar, Google Meet). */
export type ApiConnection = { toolkit: "gmail" | "googlecalendar" | "googlemeet"; status: "connected" | "pending" | "expired" | "not_connected"; since?: string }
export type Toolkit = ApiConnection["toolkit"]

/** A saved key, never with its value. */
export type ApiSecret = { name: string; allowedHosts: string[]; createdAt: string; updatedAt: string }

export const connectionsApi = {
  secrets: async () => (await api<{ secrets: ApiSecret[] }>("/secrets")).secrets,
  /** Add or replace a key (same name replaces). */
  putSecret: async (name: string, body: { value: string; allowedHosts: string[] }) =>
    (await api<{ secret: ApiSecret }>(`/secrets/${encodeURIComponent(name)}`, { method: "PUT", body })).secret,
  deleteSecret: (name: string) => api<void>(`/secrets/${encodeURIComponent(name)}`, { method: "DELETE" }),
  connections: async () => (await api<{ connections: ApiConnection[] }>("/connections")).connections,
  /** A Composio Connect Link to open in a new window (`409 already_connected` if it already is). */
  connect: async (toolkit: Toolkit) => (await api<{ redirectUrl: string }>(`/connections/${toolkit}`, { method: "POST", body: {} })).redirectUrl,
  /** Composio deletes the connection and its tokens; 404 if there was none. */
  disconnect: (toolkit: Toolkit) => api<void>(`/connections/${toolkit}`, { method: "DELETE" }),
}
