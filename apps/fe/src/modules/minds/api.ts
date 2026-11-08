import { api, ApiError } from "@/lib/api"

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
  skills: { skillId: string; description: string; status: "available" | "simulated" | "blocked" }[]
}

export type ApiWallet = {
  address: string
  shared: boolean
  balanceNear: string
  frozen: boolean
  policy: null | {
    perTransactionNear: string
    whitelist: string[]
    transactionTypes: string[]
    boundToThisWallet: boolean
  }
}

export type ApiApproval = {
  runId: string
  threadId: string
  toolCallId: string
  tool: string
  args: unknown
  requestedAt: string
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
  /** The Mind's wallet, or `null` when it has none yet (404 `no_wallet`). */
  wallet: async (mindId: string) => {
    try {
      return (await api<{ wallet: ApiWallet }>(`/minds/${encodeURIComponent(mindId)}/wallet`)).wallet
    } catch (err) {
      if (err instanceof ApiError && err.code === "no_wallet") return null
      throw err
    }
  },
  approvals: async (mindId: string) =>
    (await api<{ approvals: ApiApproval[] }>(`/minds/${encodeURIComponent(mindId)}/approvals`)).approvals,
  threads: async (mindId: string, limit = 20) =>
    (await api<{ threads: ApiThread[] }>(`/minds/${encodeURIComponent(mindId)}/threads?limit=${limit}`)).threads,
}
