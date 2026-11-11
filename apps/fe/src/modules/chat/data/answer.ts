// What happened to an approve or decline (design A1.3), as the toast shows it.

import { isApiCode } from "@/lib/api"
import { paymentOf, pendingStep, type RunView } from "@/modules/runs/data/events"
import { stepText } from "@/modules/runs/data/steps"
import { TOOLS } from "@/modules/runs/data/tools"

export type Answer = { runId: string; toolCallId: string; action: "approve" | "decline"; tool: string; args: unknown }

export type Outcome = { kind: "sending" | "sent" | "declined" | "blocked" | "failed"; title: string; detail?: string; txHash?: string }


const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function answerOutcome(answer: Answer, run: { view: RunView; streaming: boolean; failed: unknown }): Outcome {
  const step = run.view.tools.find((t) => t.toolCallId === answer.toolCallId)
  const payment = paymentOf(step ?? pendingStep(answer))
  const what = payment ? `${payment.amountNear} NEAR to ${payment.to}` : (TOOLS[answer.tool]?.thing ?? "the request")
  const nothing = payment ? "No payment was sent." : "No changes were made."

  // The answered step's own result is final as soon as it comes, while the Mind still writes its
  // reply (Ancung, 11 Nov: "Sending 0.001 NEAR" kept spinning after the payment was sent).
  const settled = step && step.status !== "awaiting_approval" && step.status !== "running"
  if (run.streaming && !settled) {
    if (answer.action === "decline") return { kind: "sending", title: `Declining ${what}` }
    return { kind: "sending", title: payment ? `Sending ${what}` : `Approving ${what}` }
  }
  if (run.failed) {
    const already = isApiCode(run.failed, "not_awaiting_approval")
    return already
      ? { kind: "failed", title: `${capital(what)} was already answered` }
      : { kind: "failed", title: "Could not send your answer", detail: "No changes were made. Please try again." }
  }
  if (answer.action === "decline" || step?.status === "declined") return { kind: "declined", title: `Declined ${what}`, detail: nothing }
  if (step?.status === "ok") {
    // A payment says what moved; anything else says what was done ("Scheduled a meeting").
    return payment ? { kind: "sent", title: `Sent ${what}`, txHash: payment.txHash } : { kind: "sent", title: stepText(step).label }
  }
  if (step?.status === "policy_denied" || step?.status === "wallet_frozen") {
    return {
      kind: "blocked",
      title: `${capital(what)} was not sent`,
      detail: step.status === "wallet_frozen" ? "The wallet is frozen." : "Blocked by your wallet limits before signing."
    }
  }
  return { kind: "failed", title: `${capital(what)} could not be completed`, detail: nothing }
}

/** An answer that never reached the run (network, 5xx) leaves the request waiting. */
export function answerLost(failed: unknown): boolean {
  return Boolean(failed) && !isApiCode(failed, "not_awaiting_approval")
}
