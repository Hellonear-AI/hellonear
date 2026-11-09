import { api } from "@/lib/api"

// Auth routes, docs/api-contract.md §7 "Auth (NEP-413)".

export type SessionUser = { id: string; nearAccountId: string; demo?: boolean }

export type Challenge = { message: string; recipient: string; nonce: string }

export type LoginBody = { accountId: string; publicKey: string; signature: string; nonce: string }

export const authApi = {
  /** A single-use nonce (32 bytes, base64) that the wallet signs within 5 minutes. */
  challenge: () => api<Challenge>("/auth/challenge", { method: "POST" }),
  /** Sets the `hn_session` cookie (7 days). 401 `invalid_nonce` or `invalid_signature`. */
  login: (body: LoginBody) => api<{ user: SessionUser }>("/auth/login", { body }),
  logout: () => api<void>("/auth/logout", { method: "POST" }),
  /**
   * Try-out (#43): a fresh user with no wallet, and the same cookie. 404 when the backend runs
   * without DEMO_MODE, 429 `demo_rate_limited` after 10 per network per hour.
   */
  demo: () => api<{ user: SessionUser }>("/auth/demo", { method: "POST", body: {} }),
  /** The signed-in user, or 401 without a session. */
  me: () => api<{ user: SessionUser }>("/me"),
}

/** The challenge nonce is base64; the wallet wants the raw 32 bytes. */
export function nonceBytes(nonce: string): Uint8Array {
  return Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0))
}
