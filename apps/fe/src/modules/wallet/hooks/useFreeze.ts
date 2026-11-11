"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { walletApi, type ApiWallet, type OwnerTransaction } from "@/modules/wallet/api"
import { mindKeys } from "@/modules/minds/hooks/useMinds"
import { ownerStep, readWalletUntil, tooLateForPopup, type Prepared } from "@/modules/wallet/data/ownerAction"
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
    mutationFn: async ({
      freeze,
      startedAt,
      prepared,
    }: {
      freeze: boolean
      /** When the owner clicked: past POPUP_SAFE_MS, a fresh build stops and asks for a click (#260). */
      startedAt: number
      /** A transaction built on an earlier click, signed straight away on this one. */
      prepared?: OwnerTransaction
    }): Promise<Prepared<OwnerTransaction> | { status: "done"; at: string; wallet: ApiWallet }> => {
      const transaction = prepared ?? (await ownerStep("build", () => walletApi.freezeTransaction(mindId, freeze)))
      if (!prepared && tooLateForPopup(startedAt)) return { status: "needs_click", transaction }
      await ownerStep("sign", () => sign(transaction))
      const wallet = await readWalletUntil(mindId, (w) => w.frozen === freeze)
      return { status: "done", at: new Date().toISOString(), wallet }
    },
    // Show the wallet as read back at once, so the page flips with the dialog (Ancung, 9 Nov:
    // it still said "Freeze wallet" behind "Wallet frozen").
    onSuccess: (r) => {
      if (r.status === "done") queryClient.setQueryData(mindKeys.wallet(mindId), r.wallet)
    },
    onError: () => queryClient.invalidateQueries({ queryKey: mindKeys.wallet(mindId) }),
  })
}
