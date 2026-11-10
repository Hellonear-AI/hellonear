// HelloNear run events (docs/api-contract.md §3) and how one run reads in the chat.
// The same fold serves a live stream and a run read back from GET /runs/{runId}.

export type RunEvent = {
  v: 1
  type: string
  runId: string
  mindId: string
  seq: number
  ts: string
  threadId?: string
  text?: string
  toolCallId?: string
  tool?: string
  nodeId?: string
  args?: unknown
  result?: unknown
  status?: string
  error?: unknown
  verification?: { status: string; level?: string }
}

/** `stopped`: still running when the owner pressed Stop (#121); it never got a result. */
export type ToolStatus = "running" | "ok" | "error" | "policy_denied" | "wallet_frozen" | "awaiting_approval" | "declined" | "stopped"

/** A step waiting for the owner, made from an approval request (Approvals, the live view, answers). */
export const pendingStep = (a: { toolCallId: string; tool: string; args: unknown }): ToolStep => ({
  toolCallId: a.toolCallId,
  tool: a.tool,
  status: "awaiting_approval",
  args: a.args,
  result: undefined,
})

export type ToolStep = {
  toolCallId: string
  tool: string
  nodeId?: string
  status: ToolStatus
  args: unknown
  result: unknown
  error?: string
  /** When the tool was called and when its result came (engine `ts`), for "6s" on its row. */
  startedAt?: string
  endedAt?: string
}

/** One piece of the reply in the order it happened: some text, or a tool (by its call id). */
export type ReplyPart =
  | { kind: "text"; text: string }
  | { kind: "tool"; toolCallId: string }
  /** The model's reasoning (`reasoning.delta`, GLM only), with when it started and last wrote. */
  | { kind: "thought"; text: string; from: string; to: string }

export type RunStatus = "running" | "awaiting_approval" | "finished" | "error" | "canceled"

export type RunView = {
  runId: string | null
  threadId: string | null
  text: string
  /** Text and tools interleaved as they happened, so a card sits between what was said before and after it. */
  parts: ReplyPart[]
  tools: ToolStep[]
  status: RunStatus
  /** "gateway_tee" or "model_tee" when every model step was verified; null for no badge (§3). */
  verified: "gateway_tee" | "model_tee" | null
  error: string | null
  /** The model is reasoning right now (its last output was reasoning, not text or a tool). */
  thinking: boolean
  /** When the run's last event was written. */
  at: string | null
  /**
   * How long the Mind worked, in ms, from its first event to its last, leaving out the time a
   * paused run waited for the owner's approval (Ancung, 9 Nov: "thought for 4s" hid a 20 s wait).
   */
  workMs: number
}

const ERROR_STATUSES: ToolStatus[] = ["error", "policy_denied", "wallet_frozen"]

/**
 * Events that only come once a paused run goes on after approve or decline. The paused stream
 * itself still ends with run.finished and run.verified (the backend keeps the run awaiting).
 */
const RESUMED = new Set(["step.started", "reasoning.delta", "text.delta", "tool.called", "tool.result", "tool.error", "run.error"])

export function foldRun(events: RunEvent[]): RunView {
  const view: RunView = { runId: null, threadId: null, text: "", parts: [], tools: [], status: "running", verified: null, error: null, thinking: false, at: null, workMs: 0 }
  const byCall = new Map<string, ToolStep>()
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  let paused = false
  let resumed = false
  let joined = false

  let prevTs: number | null = null
  // When the text part being written started, for a thought cut out of it (below).
  let textFrom: string | null = null

  for (const e of sorted) {
    view.runId ??= e.runId ?? null
    view.at = e.ts
    const wasResumed = resumed
    if (paused && RESUMED.has(e.type) && !(e.type === "tool.called" && e.toolCallId && byCall.has(e.toolCallId))) resumed = true
    // Add the time since the last event, except the gap where the run waited for the owner.
    const ts = new Date(e.ts).getTime()
    if (prevTs !== null && Number.isFinite(ts) && !(resumed && !wasResumed)) view.workMs += Math.max(0, ts - prevTs)
    if (Number.isFinite(ts)) prevTs = ts
    if (e.type === "reasoning.delta") {
      view.thinking = true
      const last = view.parts.at(-1)
      if (last?.kind === "thought") {
        last.text += e.text ?? ""
        last.to = e.ts
      } else view.parts.push({ kind: "thought", text: e.text ?? "", from: e.ts, to: e.ts })
    }
    else if (e.type === "text.delta" || e.type.startsWith("tool.") || e.type.startsWith("run.")) view.thinking = false
    switch (e.type) {
      case "run.started":
        view.threadId = e.threadId ?? view.threadId
        break
      case "text.delta":
        // The reply after an approval is a new paragraph, not glued to the text before the pause.
        if (resumed && !joined) {
          joined = true
          if (view.text && !/\s$/.test(view.text)) view.text += "\n\n"
        }
        view.text += e.text ?? ""
        if (e.text) {
          const last = view.parts.at(-1)
          if (last?.kind === "text") last.text += e.text
          else {
            view.parts.push({ kind: "text", text: e.text })
            textFrom = e.ts
          }
          // Some models (GLM) send their thinking as text, ending with "</think>" and with the opening tag
          // dropped (seen 11 Nov: a reply that was all thinking, "</think>" at its end). Once the closing tag
          // comes, what came before it is a thought, and only what follows is the reply.
          const part = view.parts.at(-1)
          if (part?.kind === "text" && part.text.includes("</think>")) {
            const cut = part.text.lastIndexOf("</think>")
            const thought = part.text.slice(0, cut).replace(/<think>/g, "").trim()
            const rest = part.text.slice(cut + "</think>".length).replace(/^\s+/, "")
            view.text = view.text.slice(0, view.text.length - part.text.length) + rest
            view.parts.pop()
            if (thought) view.parts.push({ kind: "thought", text: thought, from: textFrom ?? e.ts, to: e.ts })
            if (rest) {
              view.parts.push({ kind: "text", text: rest })
              textFrom = e.ts
            }
          }
        }
        break
      case "tool.called":
      case "tool.approval_required": {
        if (!e.toolCallId) break
        const step = byCall.get(e.toolCallId) ?? { toolCallId: e.toolCallId, tool: e.tool ?? "", nodeId: e.nodeId, status: "running" as ToolStatus, args: e.args, result: undefined, startedAt: e.ts }
        if (e.type === "tool.approval_required") {
          // A new pause after a resume (split bill: the next person's payment): approvals from the earlier
          // pause that never ran were declined, and this one waits like the first did.
          if (resumed) {
            for (const t of view.tools) if (t.status === "awaiting_approval" && t.toolCallId !== e.toolCallId) t.status = "declined"
            resumed = false
          }
          step.status = "awaiting_approval"
          paused = true
        }
        if (!byCall.has(e.toolCallId)) {
          byCall.set(e.toolCallId, step)
          view.tools.push(step)
          view.parts.push({ kind: "tool", toolCallId: e.toolCallId })
        }
        break
      }
      case "tool.result":
      case "tool.error": {
        const step = e.toolCallId ? byCall.get(e.toolCallId) : undefined
        if (!step) break
        step.result = e.result
        step.endedAt = e.ts
        const status = (e.status ?? (e.type === "tool.error" ? "error" : "ok")) as ToolStatus
        step.status = e.type === "tool.result" && paymentRefused(e.result) ? paymentRefused(e.result)! : status
        if (ERROR_STATUSES.includes(step.status)) step.error = typeof e.error === "string" ? e.error : undefined
        // The backend answers some payments that never went out with a result whose status is `failed` (a try-out's
        // demo limit, OutLayer erroring): a card reading "Sent" for one was wrong (seen 11 Nov in a split bill).
        if (e.type === "tool.result" && step.tool === "send_payment" && (e.result as { status?: unknown } | null)?.status === "failed") {
          step.status = "error"
          const message = (e.result as { message?: unknown }).message
          step.error = typeof message === "string" ? message : undefined
        }
        // Mastra answers a skill the Mind doesn't have with a plain result, 'Skill "notion" not found…': it
        // read "Picked up a skill" with a check (Ancung, 11 Nov). It failed.
        if (e.type === "tool.result" && (step.tool === "skill" || step.tool === "skill_read") && typeof e.result === "string" && /^Skill ".*" not found/.test(e.result)) {
          step.status = "error"
          step.error = "This Mind doesn't have that skill. Add it in Skills."
        }
        break
      }
      case "run.finished":
        // A run stopped with Stop ends with run.finished "canceled" and no run.verified (#121).
        view.status = e.status === "canceled" ? "canceled" : "finished"
        // A tool cut off by Stop never gets its result: it stopped, it isn't still running.
        if (view.status === "canceled") for (const t of view.tools) if (t.status === "running") t.status = "stopped"
        break
      case "run.verified": {
        const v = e.verification
        view.verified = v?.status === "verified" && (v.level === "gateway_tee" || v.level === "model_tee") ? v.level : null
        view.status = "finished"
        break
      }
      case "run.error":
        view.status = "error"
        view.error = typeof e.error === "string" ? e.error : "run_error"
        break
    }
  }

  const waiting = view.tools.filter((t) => t.status === "awaiting_approval")
  if (waiting.length > 0 && !resumed) {
    if (view.status !== "error") view.status = "awaiting_approval"
  } else if (resumed) {
    const last = sorted.at(-1)?.type
    const ended = view.status === "error" || last === "run.finished" || last === "run.verified"
    // A resumed run that ended without the tool ever running was declined. While it still runs,
    // the tool may be about to: keep it waiting so its card can say "Sending".
    if (ended) for (const step of waiting) step.status = "declined"
    else view.status = "running"
  }
  return view
}

/** `send_payment` reports a refusal as a result whose own status says so (§3, #42). */
function paymentRefused(result: unknown): ToolStatus | null {
  const status = (result as { status?: unknown } | null)?.status
  return status === "policy_denied" || status === "wallet_frozen" ? status : null
}

export type Payment = { to: string; amountNear: string; txHash?: string; status?: string; message?: string }

/** The payment a `send_payment` step asked for or made, from its result or else its args. */
export function paymentOf(step: ToolStep): Payment | null {
  if (step.tool !== "send_payment") return null
  const r = (step.result ?? {}) as Partial<Payment>
  const a = (step.args ?? {}) as Partial<Payment>
  const to = r.to ?? a.to
  const amountNear = r.amountNear ?? a.amountNear
  if (typeof to !== "string" || typeof amountNear !== "string") return null
  return { to, amountNear, txHash: r.txHash, status: r.status, message: r.message }
}
