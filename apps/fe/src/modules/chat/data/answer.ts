// What happened to an approve or decline (design A1.3), as the toast shows it.

import { ApiError } from "@/lib/api"
import { paymentOf, toolLabel, type RunView } from "@/modules/chat/data/events"

export type Answer = { runId: string; toolCallId: string; action: "approve" | "decline"; tool: string; args: unknown }

export type Outcome = { kind: "sending" | "sent" | "declined" | "blocked" | "failed"; title: string; detail?: string; txHash?: string }

export function answerOutcome(answer: Answer, run: { view: RunView; streaming: boolean; failed: unknown }): Outcome {
  const step = run.view.tools.find((t) => t.toolCallId === answer.toolCallId)
  const payment = paymentOf(step ?? { toolCallId: answer.toolCallId, tool: answer.tool, status: "awaiting_approval", args: answer.args, result: undefined })
  const what = payment ? `${payment.amountNear} NEAR to ${payment.to}` : toolLabel(answer.tool)

  if (run.streaming) return { kind: "sending", title: answer.action === "approve" ? `Sending ${what}` : `Declining ${what}` }
  if (run.failed) {
    const already = run.failed instanceof ApiError && run.failed.code === "not_awaiting_approval"
    return already
      ? { kind: "failed", title: `${what} was already answered` }
      : { kind: "failed", title: "Couldn't send your answer", detail: `Nothing changed for ${what}. Try again.` }
  }
  if (answer.action === "decline" || step?.status === "declined") return { kind: "declined", title: `Declined ${what}`, detail: "Nothing was sent." }
  if (step?.status === "ok") return { kind: "sent", title: `Sent ${what}`, txHash: payment?.txHash }
  if (step?.status === "policy_denied" || step?.status === "wallet_frozen") {
    return {
      kind: "blocked",
      title: `${what} wasn't sent`,
      detail: step.status === "wallet_frozen" ? "The wallet is frozen." : "Your limits stopped it before signing.",
    }
  }
  return { kind: "failed", title: `${what} didn't go through`, detail: "Nothing was sent." }
}

/** An answer that never reached the run (network, 5xx) leaves the request waiting. */
export function answerLost(failed: unknown): boolean {
  return Boolean(failed) && !(failed instanceof ApiError && failed.code === "not_awaiting_approval")
}
