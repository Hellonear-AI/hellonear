"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { compareNear, toYocto } from "@/lib/near"
import { walletApi, type ApiWallet, type OwnerTransaction } from "@/modules/wallet/api"
import { mindKeys } from "@/modules/minds/hooks/useMinds"
import { OwnerActionError, ownerStep, readWalletUntil, tooLateForPopup, type Prepared } from "@/modules/wallet/data/ownerAction"
import { useOwnerTransaction } from "@/modules/wallet/hooks/useOwnerTransaction"

export type Limits = { perTransactionNear: string; dailyNear: string | null; whitelist: string[] }

export function sameLimits(policy: ApiWallet["policy"], limits: Limits): boolean {
  if (!policy?.perTransactionNear || !policy.whitelist) return false
  const a = [...policy.whitelist].map((x) => x.toLowerCase()).sort()
  const b = [...limits.whitelist].sort()
  // A daily cap (#149) counts too: the policy shows it as soon as it is stored.
  const daily = (policy.dailyNear ?? null) === null ? limits.dailyNear === null : limits.dailyNear !== null && compareNear(policy.dailyNear!, limits.dailyNear) === 0
  return daily && compareNear(policy.perTransactionNear, limits.perTransactionNear) === 0 && a.length === b.length && a.every((x, i) => x === b[i])
}

/**
 * Change limits (W2), or set them up the first time (W1.6, a Mind with no wallet or no limits):
 * create the wallet if needed (409 wallet_exists is fine), the backend builds
 * `store_wallet_policy`, the owner signs it in Meteor, then the wallet is read back until the
 * new limits show.
 */
export function useSaveLimits(mindId: string) {
  const queryClient = useQueryClient()
  const sign = useOwnerTransaction()
  return useMutation({
    mutationFn: async ({
      limits,
      createWallet,
      startedAt,
      prepared,
    }: {
      limits: Limits
      createWallet: boolean
      /** When the owner clicked: past POPUP_SAFE_MS, a fresh build stops and asks for a click (#260). */
      startedAt: number
      /** A transaction built on an earlier click, signed straight away on this one. */
      prepared?: OwnerTransaction
    }): Promise<Prepared<OwnerTransaction> | { status: "saved"; wallet: ApiWallet }> => {
      const transaction =
        prepared ??
        (await ownerStep("build", async () => {
          if (createWallet) await walletApi.createWallet(mindId)
          return walletApi.policyTransaction(mindId, limits)
        }))
      if (!prepared && tooLateForPopup(startedAt)) return { status: "needs_click", transaction }
      await ownerStep("sign", () => sign(transaction))
      return { status: "saved", wallet: await readWalletUntil(mindId, (w) => sameLimits(w.policy, limits)) }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: mindKeys.wallet(mindId) }),
  })
}

/**
 * Add funds (W4): the owner's Meteor wallet sends NEAR straight to the Mind's wallet address
 * (a plain Transfer, no backend call), then the balance is read back until it grew.
 */
export function useAddFunds(mindId: string) {
  const queryClient = useQueryClient()
  const sign = useOwnerTransaction()
  return useMutation({
    mutationFn: async ({ address, amountNear, balanceBefore }: { address: string; amountNear: string; balanceBefore: string }) => {
      const deposit = toYocto(amountNear)
      if (!deposit) throw new OwnerActionError("build", new Error("Not an amount"))
      await ownerStep("sign", () => sign({ receiverId: address, actions: [{ type: "Transfer", params: { deposit } }] }))
      return readWalletUntil(mindId, (w) => compareNear(w.balanceNear, balanceBefore) === 1)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: mindKeys.wallet(mindId) })
      void queryClient.invalidateQueries({ queryKey: mindKeys.all })
    },
  })
}
