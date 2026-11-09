import { ApiError } from "@/lib/api"
import { WalletActionError } from "@/modules/wallet/hooks/useWalletActions"
import { WrongAccountError } from "@/modules/wallet/hooks/useOwnerTransaction"

/** What went wrong with an owner action, in plain words, and whether anything changed. */
export function walletActionText(err: unknown, kind: "limits" | "funds"): string {
  const what = kind === "limits" ? "the limits weren't saved" : "nothing was sent"
  if (err instanceof WalletActionError) {
    if (err.step === "sign" && err.cause instanceof WrongAccountError) {
      return `Your wallet is signed in as ${err.cause.actual.join(", ") || "another account"}. Switch it to ${err.cause.expected}, then try again.`
    }
    if (err.step === "sign") return `Meteor didn't sign, so ${what}.`
    if (err.step === "check") {
      return kind === "limits" ? "Meteor signed, but the new limits don't show yet. Check again in a moment." : "Meteor sent it, but the balance doesn't show it yet. Check again in a moment."
    }
    if (err.cause instanceof ApiError && err.cause.code === "demo_not_allowed") return "Connect a wallet to do this."
  }
  return `Couldn't reach the wallet service, so ${what}. Try again in a moment.`
}
