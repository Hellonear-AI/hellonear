import { api } from "@/lib/api"

// Secrets (#18) and app connections (#13): docs/api-contract.md §7. Account level, not per Mind.

/** An app the account connects through Composio (Gmail, Google Calendar, Google Meet). */
export type ApiConnection = {
  toolkit: "gmail" | "googlecalendar" | "googlemeet" | "googlesheets" | "googledrive" | "googledocs" | "slack" | "discord" | "notion" | "outlook" | "hubspot" | "zoom"
  status: "connected" | "pending" | "expired" | "not_connected"; since?: string }
export type Toolkit = ApiConnection["toolkit"]

/** A Mind's own Telegram bot (#168): never the token. `linkUrl` until the owner has linked their chat. */
export type ApiTelegram =
  | { connected: false }
  | { connected: true; botUsername: string; linked: boolean; ownerName: string | null; linkUrl: string | null; mode: "webhook" | "polling" }

/** A saved key, never with its value. */
export type ApiSecret = { name: string; allowedHosts: string[]; createdAt: string; updatedAt: string }

export const connectionsApi = {
  telegram: async (mindId: string) => (await api<{ telegram: ApiTelegram }>(`/minds/${encodeURIComponent(mindId)}/telegram`)).telegram,
  /** Checks the token with Telegram and points the bot at us; a new token resets the owner link. */
  connectTelegram: async (mindId: string, token: string) =>
    (await api<{ telegram: ApiTelegram }>(`/minds/${encodeURIComponent(mindId)}/telegram`, { method: "PUT", body: { token } })).telegram,
  disconnectTelegram: (mindId: string) => api<void>(`/minds/${encodeURIComponent(mindId)}/telegram`, { method: "DELETE" }),
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
