"use client"

import { useNearWallet } from "near-connect-hooks"
import { useSession } from "@/modules/auth/hooks/useSession"
import type { OwnerTransaction } from "@/modules/wallet/api"

/** The wallet is signed in to another account than the HelloNear session. */
export class WrongAccountError extends Error {
  constructor(readonly expected: string, readonly actual: string[]) {
    super(`The wallet is signed in as ${actual.join(", ") || "nobody"}, not ${expected}`)
  }
}

/**
 * Signs and sends an owner action the backend built (`docs/api-contract.md` §7, Mind wallet)
 * with the signed-in account. Uses the connector directly, like sign-in does, because the
 * hook's own state can be a render behind.
 */
export function useOwnerTransaction() {
  const { connector, signedAccountId } = useNearWallet()
  const owner = useSession().data?.nearAccountId

  return async (transaction: OwnerTransaction) => {
    if (!owner) throw new Error("Not signed in")
    const wallet = signedAccountId ? await connector.wallet() : await connector.connect()
    const accounts = (await wallet.getAccounts()).map((a) => a.accountId)
    if (!accounts.includes(owner)) throw new WrongAccountError(owner, accounts)
    return wallet.signAndSendTransaction({ signerId: owner, receiverId: transaction.receiverId, actions: transaction.actions })
  }
}
