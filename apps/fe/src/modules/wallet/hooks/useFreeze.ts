"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { mindsApi } from "@/modules/minds/api"
import { mindKeys } from "@/modules/minds/hooks/useMinds"
import { useOwnerTransaction } from "@/modules/wallet/hooks/useOwnerTransaction"

/** Where freezing stopped: building the transaction, the owner's signature, or reading it back. */
export class FreezeError extends Error {
  constructor(
    readonly step: "build" | "sign" | "check",
    readonly cause: unknown
  ) {
    super(`Freeze failed at ${step}`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Freeze or unfreeze a Mind's wallet (design W3): the backend builds `freeze_wallet` /
 * `unfreeze_wallet` on outlayer.testnet, the owner signs it in Meteor, then the wallet is read
 * back until it shows the new state. A frozen wallet's transfers are refused before signing.
 */
export function useFreeze(mindId: string) {
  const queryClient = useQueryClient()
  const sign = useOwnerTransaction()

  return useMutation({
    mutationFn: async (freeze: boolean) => {
      let transaction
      try {
        transaction = await mindsApi.freezeTransaction(mindId, freeze)
      } catch (err) {
        throw new FreezeError("build", err)
      }
      try {
        await sign(transaction)
      } catch (err) {
        throw new FreezeError("sign", err)
      }
      for (let i = 0; i < 5; i++) {
        const wallet = await mindsApi.wallet(mindId).catch(() => null)
        if (wallet && wallet.frozen === freeze) return { at: new Date().toISOString() }
        await sleep(1500)
      }
      throw new FreezeError("check", null)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: mindKeys.wallet(mindId) }),
  })
}
