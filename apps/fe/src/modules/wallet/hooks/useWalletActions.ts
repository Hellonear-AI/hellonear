"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { compareNear, toYocto } from "@/lib/near"
import { mindsApi, type ApiWallet } from "@/modules/minds/api"
import { mindKeys } from "@/modules/minds/hooks/useMinds"
import { useOwnerTransaction } from "@/modules/wallet/hooks/useOwnerTransaction"

/** Where an owner action stopped: preparing it, the owner's signature, or reading the wallet back. */
export class WalletActionError extends Error {
  constructor(
    readonly step: "build" | "sign" | "check",
    readonly cause: unknown
  ) {
    super(`Wallet action failed at ${step}`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Read the wallet until `done` says the change shows (OutLayer can take a moment). */
async function readBack(mindId: string, done: (w: ApiWallet) => boolean): Promise<ApiWallet> {
  for (let i = 0; i < 6; i++) {
    const wallet = await mindsApi.wallet(mindId).catch(() => null)
    if (wallet && done(wallet)) return wallet
    await sleep(1500)
  }
  throw new WalletActionError("check", null)
}

export type Limits = { perTransactionNear: string; whitelist: string[] }

export function sameLimits(policy: ApiWallet["policy"], limits: Limits): boolean {
  if (!policy?.perTransactionNear || !policy.whitelist) return false
  const a = [...policy.whitelist].map((x) => x.toLowerCase()).sort()
  const b = [...limits.whitelist].sort()
  return compareNear(policy.perTransactionNear, limits.perTransactionNear) === 0 && a.length === b.length && a.every((x, i) => x === b[i])
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
    mutationFn: async ({ limits, createWallet }: { limits: Limits; createWallet: boolean }) => {
      let transaction
      try {
        if (createWallet) await mindsApi.createWallet(mindId)
        transaction = await mindsApi.policyTransaction(mindId, limits)
      } catch (err) {
        throw new WalletActionError("build", err)
      }
      try {
        await sign(transaction)
      } catch (err) {
        throw new WalletActionError("sign", err)
      }
      return readBack(mindId, (w) => sameLimits(w.policy, limits))
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
      if (!deposit) throw new WalletActionError("build", new Error("Not an amount"))
      try {
        await sign({ receiverId: address, actions: [{ type: "Transfer", params: { deposit } }] })
      } catch (err) {
        throw new WalletActionError("sign", err)
      }
      return readBack(mindId, (w) => compareNear(w.balanceNear, balanceBefore) === 1)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: mindKeys.wallet(mindId) })
      void queryClient.invalidateQueries({ queryKey: mindKeys.all })
    },
  })
}
