import { api, isApiCode } from "@/lib/api"

// Templates, Minds, wallet, approvals and threads routes: docs/api-contract.md §7.

export type ApiMind = {
  id: string
  templateId: string
  name: string
  soul: { identity: string; invariants: string[]; priors: string[] }
  model: string
  skills: string[]
  outlayerWalletId: string | null
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

export type ApiWallet = {
  address: string
  shared: boolean
  balanceNear: string
  frozen: boolean
  /** Fields are null when the policy was set elsewhere (e.g. the OutLayer dashboard) without them. */
  policy: null | {
    perTransactionNear: string | null
    whitelist: string[] | null
    transactionTypes: string[] | null
    boundToThisWallet: boolean
  }
}

/** An owner action on `outlayer.testnet`, built by the backend for the owner's wallet to sign. */
export type OwnerTransaction = {
  receiverId: string
  actions: (
    | { type: "FunctionCall"; params: { methodName: string; args: object; gas: string; deposit: string } }
    // Add funds (W4): the owner sends NEAR straight to the Mind's wallet address.
    | { type: "Transfer"; params: { deposit: string } }
  )[]
}

export type ApiApproval = {
  runId: string
  threadId: string
  toolCallId: string
  tool: string
  args: unknown
  requestedAt: string
}

/** One attempt to pay from the Mind's wallet (`GET …/wallet/payments`), newest first. */
export type ApiPayment = {
  paymentId: string
  to: string
  amountNear: string
  status: "sent" | "policy_denied" | "wallet_frozen" | "failed" | "pending"
  txHash?: string
  message?: string
  at: string
}

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

export type ApiConnection = { toolkit: "gmail" | "googlecalendar" | "googlemeet"; status: "connected" | "pending" | "expired" | "not_connected"; since?: string }

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
  update: async (mindId: string, body: Partial<Pick<ApiMind, "name" | "soul" | "model" | "skills">>) =>
    (await api<{ mind: ApiMind }>(`/minds/${encodeURIComponent(mindId)}`, { method: "PATCH", body })).mind,
  /**
   * Delete a Mind, its chats, memory and Autopilot jobs (`204`). While its own wallet holds more
   * than 0.001 NEAR the backend answers `409 wallet_not_empty` with `balanceNear` (#163): deleting
   * removes the wallet's only key, so nobody could move that NEAR again. `acknowledgeBalance`
   * confirms the owner saw that.
   */
  remove: async (mindId: string, acknowledgeBalance = false) =>
    api<void>(`/minds/${encodeURIComponent(mindId)}${acknowledgeBalance ? "?acknowledgeBalance=true" : ""}`, { method: "DELETE" }),
  skills: async () => (await api<{ skills: ApiSkill[] }>("/skills")).skills,
  connections: async () => (await api<{ connections: ApiConnection[] }>("/connections")).connections,
  /** A Composio Connect Link to open in a new window (`409 already_connected` if it already is). */
  connect: async (toolkit: ApiConnection["toolkit"]) =>
    (await api<{ redirectUrl: string }>(`/connections/${toolkit}`, { method: "POST", body: {} })).redirectUrl,
  /** The Mind's wallet, or `null` when it has none yet (404 `no_wallet`). */
  wallet: async (mindId: string) => {
    try {
      return (await api<{ wallet: ApiWallet }>(`/minds/${encodeURIComponent(mindId)}/wallet`)).wallet
    } catch (err) {
      if (isApiCode(err, "no_wallet")) return null
      throw err
    }
  },
  /** Creates the Mind's OutLayer wallet. A wallet that already exists (409 `wallet_exists`) is fine. */
  createWallet: async (mindId: string) => {
    try {
      await api(`/minds/${encodeURIComponent(mindId)}/wallet`, { method: "POST", body: {} })
    } catch (err) {
      if (!isApiCode(err, "wallet_exists")) throw err
    }
  },
  /** The `store_wallet_policy` transaction for policy v2; the owner signs it. */
  policyTransaction: async (mindId: string, body: { perTransactionNear: string; whitelist: string[] }) =>
    (await api<{ transaction: OwnerTransaction }>(`/minds/${encodeURIComponent(mindId)}/wallet/policy`, { method: "POST", body }))
      .transaction,
  approvals: async (mindId: string) =>
    (await api<{ approvals: ApiApproval[] }>(`/minds/${encodeURIComponent(mindId)}/approvals`)).approvals,
  payments: async (mindId: string, limit = 20) =>
    (await api<{ payments: ApiPayment[] }>(`/minds/${encodeURIComponent(mindId)}/wallet/payments?limit=${limit}`)).payments,
  /** `freeze_wallet` / `unfreeze_wallet` on outlayer.testnet for the owner to sign (30 Tgas, no deposit). */
  freezeTransaction: async (mindId: string, freeze: boolean) =>
    (await api<{ transaction: OwnerTransaction }>(`/minds/${encodeURIComponent(mindId)}/wallet/${freeze ? "freeze" : "unfreeze"}`, { method: "POST", body: {} }))
      .transaction,
  /** A Mind's runs, newest first (chat runs, builder runs; a resumed run is the same run). */
  runs: async (mindId: string, limit = 20) =>
    (await api<{ runs: { runId: string }[] }>(`/minds/${encodeURIComponent(mindId)}/runs?limit=${limit}`)).runs,
  threads: async (mindId: string, limit = 20) =>
    (await api<{ threads: ApiThread[] }>(`/minds/${encodeURIComponent(mindId)}/threads?limit=${limit}`)).threads,
}
