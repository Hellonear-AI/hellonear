"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { mindsApi } from "@/modules/minds/api"
import type { Mind } from "@/modules/minds/data/minds"
import { mindKeys } from "@/modules/minds/hooks/useMinds"
import { OwnerActionError, ownerStep, readWalletUntil } from "@/modules/wallet/data/ownerAction"
import { useOwnerTransaction } from "@/modules/wallet/hooks/useOwnerTransaction"

export type SetUpInput = { templateId: string; name: string; perTransactionNear: string; whitelist: string[] }
export type SetUpStage = "idle" | "creating" | "signing" | "checking"

/**
 * Create a Mind with its spending limits (design L3): create the Mind, its OutLayer wallet,
 * have the backend build the policy transaction, the owner signs it in their wallet, then
 * read the wallet back until the policy shows.
 *
 * The Mind and wallet must exist before there is anything to sign. If signing is canceled
 * they stay (decided 8 Nov), and "Try again" picks up where it stopped instead of creating
 * a second Mind.
 */
export function useSetUpMind() {
  const queryClient = useQueryClient()
  const signTransaction = useOwnerTransaction()
  const progress = useRef<{ mindId?: string; walletReady?: boolean; signed?: boolean }>({})
  const [stage, setStage] = useState<SetUpStage>("idle")
  const [createdMindId, setCreatedMindId] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (input: SetUpInput) => {
      const p = progress.current
      try {
        if (!p.signed) {
          setStage("creating")
          if (!p.mindId) {
            const mind = await mindsApi.create({ templateId: input.templateId, name: input.name })
            p.mindId = mind.id
            setCreatedMindId(mind.id)
            const created: Mind = { mindId: mind.id, name: mind.name, templateId: mind.templateId, skills: mind.skills, balanceNear: null }
            queryClient.setQueryData<Mind[]>(mindKeys.all, (old) => [created, ...(old ?? []).filter((m) => m.mindId !== mind.id)])
          }
          if (!p.walletReady) {
            await mindsApi.createWallet(p.mindId)
            p.walletReady = true
          }
        }
      } catch (err) {
        throw new OwnerActionError("build", err)
      }
      const mindId = p.mindId!

      if (!p.signed) {
        // Building the transaction is part of creating it, for the user.
        const transaction = await ownerStep("build", () =>
          mindsApi.policyTransaction(mindId, { perTransactionNear: input.perTransactionNear, whitelist: input.whitelist })
        )
        setStage("signing")
        await ownerStep("sign", () => signTransaction(transaction))
        p.signed = true
      }

      setStage("checking")
      const wallet = await readWalletUntil(mindId, (w) => Boolean(w.policy))
      return { mindId, wallet }
    },
    onSettled: () => {
      setStage("idle")
      void queryClient.invalidateQueries({ queryKey: mindKeys.all })
    },
  })

  return { ...mutation, stage, createdMindId }
}
