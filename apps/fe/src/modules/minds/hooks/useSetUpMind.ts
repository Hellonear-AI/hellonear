"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { mindsApi } from "@/modules/minds/api"
import { walletApi, type OwnerTransaction } from "@/modules/wallet/api"
import type { Mind } from "@/modules/minds/data/minds"
import { mindKeys } from "@/modules/minds/hooks/useMinds"
import { OwnerActionError, ownerStep, readWalletUntil, tooLateForPopup } from "@/modules/wallet/data/ownerAction"
import { useOwnerTransaction } from "@/modules/wallet/hooks/useOwnerTransaction"

export type SetUpInput = {
  templateId: string
  name: string
  perTransactionNear: string
  whitelist: string[]
  /** When the owner clicked: past POPUP_SAFE_MS, the flow stops before signing and asks for a click (#260). */
  startedAt: number
}
/** "ready": built, waiting for a click that opens Meteor (#260). */
export type SetUpStage = "idle" | "creating" | "ready" | "signing" | "checking"

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
  const progress = useRef<{ mindId?: string; walletReady?: boolean; signed?: boolean; transaction?: { key: string; tx: OwnerTransaction } }>({})
  // Built and waiting for the click that signs it (survives the mutation's own reset).
  const [ready, setReady] = useState(false)
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
            await walletApi.createWallet(p.mindId)
            p.walletReady = true
          }
        }
      } catch (err) {
        throw new OwnerActionError("build", err)
      }
      const mindId = p.mindId!

      if (!p.signed) {
        // Building the transaction is part of creating it, for the user.
        // A transaction built on the last click is signed at once on this one, if the limits are
        // still the ones it was built for.
        const key = JSON.stringify([input.perTransactionNear, input.whitelist])
        const built = p.transaction?.key === key ? p.transaction.tx : undefined
        const transaction =
          built ??
          (await ownerStep("build", () =>
            walletApi.policyTransaction(mindId, { perTransactionNear: input.perTransactionNear, dailyNear: null, whitelist: input.whitelist })
          ))
        // Creating the Mind, its wallet and the transaction takes seconds; past the browser's
        // window for opening Meteor from the first click, stop here and wait for one more.
        if (!built && tooLateForPopup(input.startedAt)) {
          p.transaction = { key, tx: transaction }
          setReady(true)
          return { status: "needs_click" as const }
        }
        setReady(false)
        setStage("signing")
        await ownerStep("sign", () => signTransaction(transaction))
        p.signed = true
        p.transaction = undefined
      }

      setStage("checking")
      const wallet = await readWalletUntil(mindId, (w) => Boolean(w.policy))
      return { status: "done" as const, mindId, wallet }
    },
    onSettled: () => {
      setStage("idle")
      void queryClient.invalidateQueries({ queryKey: mindKeys.all })
    },
  })

  return { ...mutation, stage: ready && stage === "idle" ? ("ready" as const) : stage, createdMindId }
}
