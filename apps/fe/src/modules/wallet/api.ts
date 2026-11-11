import { api, isApiCode } from "@/lib/api"
import { NEAR_RPC_URL } from "@/lib/config"
import { fromYocto } from "@/lib/near"

// A Mind's wallet, its policy, payments and approvals: docs/api-contract.md §7 (Mind wallet).

export type ApiWallet = {
  address: string
  shared: boolean
  balanceNear: string
  /** What OutLayer counted as spent today (#149), a NEAR string; its day starts at 00:00 UTC. Missing from an older backend. */
  spentTodayNear?: string
  frozen: boolean
  /** Fields are null when the policy was set elsewhere (e.g. the OutLayer dashboard) without them. */
  policy: null | {
    perTransactionNear: string | null
    /** The daily cap (#149), enforced in the TEE and reset at 00:00 UTC; null for none. */
    dailyNear?: string | null
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

export const walletApi = {
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
  policyTransaction: async (mindId: string, body: { perTransactionNear: string; dailyNear: string | null; whitelist: string[] }) =>
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
}

/**
 * Storage costs 10^19 yoctoNEAR per byte, and an account using 770 bytes or less needs no storage
 * balance (docs.near.org, storage staking and accounts FAQ; checked 9 Nov). That part can't be sent.
 */
const YOCTO_PER_BYTE = BigInt("10000000000000000000")

/**
 * What the owner can send from their own account, in NEAR (Add funds, W4.3): the account's
 * balance minus what its storage holds, read from the testnet RPC (`view_account`). Null when
 * the account can't be read.
 */
export async function ownerAvailableNear(accountId: string): Promise<string | null> {
  try {
    const res = await fetch(NEAR_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "hellonear", method: "query", params: { request_type: "view_account", finality: "final", account_id: accountId } }),
    })
    const data = (await res.json()) as { result?: { amount?: string; storage_usage?: number } }
    if (!data.result?.amount) return null
    const bytes = data.result.storage_usage ?? 0
    const locked = bytes > 770 ? BigInt(bytes) * YOCTO_PER_BYTE : BigInt(0)
    const free = BigInt(data.result.amount) - locked
    return fromYocto((free > BigInt(0) ? free : BigInt(0)).toString())
  } catch {
    return null
  }
}
