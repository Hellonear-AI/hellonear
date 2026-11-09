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

export type ToolStatus = "running" | "ok" | "error" | "policy_denied" | "wallet_frozen" | "awaiting_approval" | "declined"

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

export type RunStatus = "running" | "awaiting_approval" | "finished" | "error"

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
          else view.parts.push({ kind: "text", text: e.text })
        }
        break
      case "tool.called":
      case "tool.approval_required": {
        if (!e.toolCallId) break
        const step = byCall.get(e.toolCallId) ?? { toolCallId: e.toolCallId, tool: e.tool ?? "", nodeId: e.nodeId, status: "running" as ToolStatus, args: e.args, result: undefined, startedAt: e.ts }
        if (e.type === "tool.approval_required") {
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
        break
      }
      case "run.finished":
        view.status = "finished"
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

const TOOL_LABEL: Record<string, string> = {
  send_payment: "Preparing a payment",
  get_balance: "Checking the balance",
  list_payments: "Looking at past payments",
  near_view_account: "Looking up a NEAR account",
  http_request: "Calling a website",
  get_time: "Checking the time",
  gmail_list_emails: "Reading your inbox",
  gmail_read_email: "Reading an email",
  gmail_create_draft: "Saving a draft in Gmail",
  googlecalendar_list_events: "Checking your calendar",
  googlecalendar_create_event: "Adding to your calendar",
  skill: "Picking up a skill",
  skill_read: "Picking up a skill",
}

/** Plain words for what a tool is doing; unknown tools get a neutral line. */
export function toolLabel(tool: string): string {
  return TOOL_LABEL[tool] ?? "Using a tool"
}
