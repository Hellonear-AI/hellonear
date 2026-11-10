"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { walletApi } from "@/modules/wallet/api"
import { mindKeys } from "@/modules/minds/hooks/useMinds"
import { ownerStep, readWalletUntil } from "@/modules/wallet/data/ownerAction"
import { useOwnerTransaction } from "@/modules/wallet/hooks/useOwnerTransaction"

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
      const transaction = await ownerStep("build", () => walletApi.freezeTransaction(mindId, freeze))
      await ownerStep("sign", () => sign(transaction))
      const wallet = await readWalletUntil(mindId, (w) => w.frozen === freeze)
      return { at: new Date().toISOString(), wallet }
    },
    // Show the wallet as read back at once, so the page flips with the dialog (Ancung, 9 Nov:
    // it still said "Freeze wallet" behind "Wallet frozen").
    onSuccess: ({ wallet }) => queryClient.setQueryData(mindKeys.wallet(mindId), wallet),
    onError: () => queryClient.invalidateQueries({ queryKey: mindKeys.wallet(mindId) }),
  })
}
