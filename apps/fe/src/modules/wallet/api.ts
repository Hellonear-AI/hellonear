import { NEAR_RPC_URL } from "@/lib/config"
import { fromYocto } from "@/lib/near"

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
