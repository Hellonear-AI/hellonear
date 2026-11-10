import { isApiCode } from "@/lib/api"
import { OwnerActionError, wrongAccountText } from "@/modules/wallet/data/ownerAction"

/** What went wrong with an owner action, in plain words, and whether anything changed. */
export function walletActionText(err: unknown, kind: "limits" | "funds"): string {
  const what = kind === "limits" ? "the limits were not saved" : "no funds were sent"
  if (err instanceof OwnerActionError) {
    const wrong = err.step === "sign" ? wrongAccountText(err) : null
    if (wrong) return wrong
    if (err.step === "sign") return `Meteor did not sign the transaction, so ${what}.`
    if (err.step === "check") {
      return kind === "limits" ? "The transaction was signed, but the new limits are not visible yet. Please check again shortly." : "The transfer was sent, but the new balance is not visible yet. Please check again shortly."
    }
    if (isApiCode(err.cause, "demo_not_allowed")) return "Connect a wallet to do this."
  }
  return `Could not reach the wallet service, so ${what}. Please try again later.`
}
