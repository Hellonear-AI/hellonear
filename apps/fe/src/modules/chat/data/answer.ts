// What happened to an approve or decline (design A1.3), as the toast shows it.

import { ApiError } from "@/lib/api"
import { paymentOf, type RunView } from "@/modules/chat/data/events"
import { stepText } from "@/modules/chat/data/steps"

export type Answer = { runId: string; toolCallId: string; action: "approve" | "decline"; tool: string; args: unknown }

export type Outcome = { kind: "sending" | "sent" | "declined" | "blocked" | "failed"; title: string; detail?: string; txHash?: string }

/** What the owner said yes or no to, when it isn't a payment ("Declining the meeting"). */
const THING: Record<string, string> = {
  googlecalendar_create_event: "the event",
  googlecalendar_create_meeting: "the meeting",
  mail_send: "the email",
  gmail_create_draft: "the draft",
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function answerOutcome(answer: Answer, run: { view: RunView; streaming: boolean; failed: unknown }): Outcome {
  const step = run.view.tools.find((t) => t.toolCallId === answer.toolCallId)
  const payment = paymentOf(step ?? { toolCallId: answer.toolCallId, tool: answer.tool, status: "awaiting_approval", args: answer.args, result: undefined })
  const what = payment ? `${payment.amountNear} NEAR to ${payment.to}` : (THING[answer.tool] ?? "the request")
  const nothing = payment ? "No payment was sent." : "No changes were made."

  if (run.streaming) {
    if (answer.action === "decline") return { kind: "sending", title: `Declining ${what}` }
    return { kind: "sending", title: payment ? `Sending ${what}` : `Approving ${what}` }
  }
  if (run.failed) {
    const already = run.failed instanceof ApiError && run.failed.code === "not_awaiting_approval"
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
  return Boolean(failed) && !(failed instanceof ApiError && failed.code === "not_awaiting_approval")
}
