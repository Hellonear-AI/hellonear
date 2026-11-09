"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { mindHref } from "@/components/layout/nav"
import { ApiError } from "@/lib/api"
import { useLeaveTryOut, useSession, useSignOut } from "@/modules/auth/hooks/useSession"
import { checkLimits, DEFAULT_PER_PAYMENT } from "@/modules/minds/data/limits"
import { useCreateMind, useMinds } from "@/modules/minds/hooks/useMinds"
import { SetUpError, useSetUpMind } from "@/modules/minds/hooks/useSetUpMind"
import { WrongAccountError } from "@/modules/wallet/hooks/useOwnerTransaction"
import { ChooseMindStep } from "@/modules/minds/components/ChooseMindStep"
import { SetLimitsStep } from "@/modules/minds/components/SetLimitsStep"
import { MindReady } from "@/modules/minds/components/MindReady"

const SIGN_TOAST_ID = "meteor-sign"

type Notice = { text: string; retry: string }

/**
 * `/minds/new`: Choose a Mind (L2), then Set limits (L3), then the ready moment (L3.5).
 * Every value lives here, so going back and forth keeps what the user typed.
 * Try-out users have no wallet to sign with: their Minds pay from the shared demo wallet,
 * so they skip the limits step (docs/api-contract.md, try-out users).
 */
export function NewMindFlow() {
  const router = useRouter()
  const session = useSession()
  const createMind = useCreateMind()
  const setUp = useSetUpMind()
  const minds = useMinds().data
  const leaveTryOut = useLeaveTryOut()
  const signOut = useSignOut()

  const [step, setStep] = useState<"choose" | "limits">("choose")
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [perPayment, setPerPayment] = useState(DEFAULT_PER_PAYMENT)
  const [rows, setRows] = useState<string[]>([""])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [ready, setReady] = useState<{ mindId: string; perTransactionNear: string } | null>(null)
  const check = useMemo(() => checkLimits(perPayment, rows), [perPayment, rows])

  const signedOut = session.isSuccess && !session.data
  useEffect(() => {
    if (signedOut) router.replace("/")
  }, [signedOut, router])

  // Tell the user where to look while the wallet window is open (L3.3).
  useEffect(() => {
    if (setUp.stage === "signing") {
      toast("Check the Meteor window to sign. Nothing is saved until you do.", { id: SIGN_TOAST_ID, duration: Infinity })
    } else {
      toast.dismiss(SIGN_TOAST_ID)
    }
  }, [setUp.stage])

  if (session.isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">Couldn&apos;t reach HelloNear. Check your connection and try again.</p>
        <Button variant="outline" onClick={() => void session.refetch()}>
          Try again
        </Button>
      </div>
    )
  }
  if (!session.data) return <div className="min-h-dvh bg-background" aria-busy="true" />

  const trimmedName = name.trim()

  if (ready && templateId) {
    return <MindReady mindId={ready.mindId} name={trimmedName} templateId={templateId} perTransactionNear={ready.perTransactionNear} />
  }

  if (step === "limits" && templateId) {
    return (
      <SetLimitsStep
        name={trimmedName}
        templateId={templateId}
        perPayment={perPayment}
        onPerPaymentChange={setPerPayment}
        rows={rows}
        onRowsChange={setRows}
        check={check}
        stage={setUp.stage}
        notice={notice}
        onBack={setUp.createdMindId ? undefined : () => setStep("choose")}
        onSubmit={() => {
          setNotice(null)
          setUp.mutate(
            { templateId, name: trimmedName, perTransactionNear: perPayment.trim(), whitelist: check.whitelist },
            {
              onSuccess: ({ mindId, wallet }) =>
                setReady({ mindId, perTransactionNear: wallet.policy?.perTransactionNear ?? perPayment.trim() }),
              onError: (err) => setNotice(setUpNotice(err, trimmedName)),
            }
          )
        }}
      />
    )
  }

  return (
    <ChooseMindStep
      picked={templateId}
      onPick={setTemplateId}
      name={name}
      onNameChange={setName}
      busy={createMind.isPending}
      tryOut={Boolean(session.data?.demo)}
      // Always a way out: a try-out goes back to the wallets, a first-time owner can sign out,
      // and an owner making another Mind goes back to the one they have.
      leave={
        session.data?.demo
          ? { label: "Use a wallet instead", onClick: leaveTryOut }
          : minds?.[0]
            ? { label: `Back to ${minds[0].name}`, href: mindHref(minds[0].mindId) }
            : { label: "Sign out", onClick: () => signOut.mutate(undefined, { onSettled: () => router.replace("/") }) }
      }
      onContinue={() => {
        if (!templateId) return
        if (!session.data?.demo) {
          setStep("limits")
          return
        }
        createMind.mutate(
          { templateId, name: trimmedName },
          {
            onSuccess: (mind) => router.push(mindHref(mind.id)),
            onError: (err) => toast.error(createErrorMessage(err)),
          }
        )
      }}
    />
  )
}

function setUpNotice(err: unknown, name: string): Notice {
  if (err instanceof SetUpError && err.step === "sign") {
    if (err.cause instanceof WrongAccountError) {
      const actual = err.cause.actual.join(", ") || "another account"
      return { text: `Your wallet is signed in as ${actual}. Switch it to ${err.cause.expected}, then try again.`, retry: "Try again" }
    }
    // The wallet sent the transaction but the contract refused it (it carries the execution error).
    if (/ExecutionError|FunctionCallError|publishing_transaction_failed/.test(errorText(err.cause))) {
      return {
        text: `Meteor signed, but outlayer.testnet refused the transaction, so the limits weren't saved. ${name} is waiting; try again later.`,
        retry: "Try again",
      }
    }
    return {
      text: `Meteor didn't sign, so the limits weren't saved. ${name} is waiting, and your limits are still here.`,
      retry: "Try again",
    }
  }
  if (err instanceof SetUpError && err.step === "check") {
    return { text: "Meteor signed, but the limits don't show up yet. Check again in a moment.", retry: "Check again" }
  }
  const cause = err instanceof SetUpError ? err.cause : err
  if (cause instanceof ApiError && (cause.code === "outlayer_error" || cause.code === "outlayer_unreachable")) {
    return { text: "The wallet service didn't answer. Nothing was signed. Try again in a moment.", retry: "Try again" }
  }
  return { text: `Couldn't set up ${name}. Nothing was signed. Try again.`, retry: "Try again" }
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function createErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === "unknown_template") return "That Mind isn't available any more. Pick another one."
  if (err instanceof ApiError && err.status === 401) return "Your session ended. Sign in again."
  return "Couldn't create your Mind. Try again."
}
