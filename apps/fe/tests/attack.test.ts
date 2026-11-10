import { describe, expect, it } from "vitest"
import { attackCopy, KNOWN_ATTACKS } from "@/modules/attack/data/attacks"
import { attackOutcome, verdictIn } from "@/modules/attack/data/outcome"
import type { RunEvent } from "@/modules/runs/data/events"

let seq = 0
const ev = (type: string, extra: Record<string, unknown> = {}): RunEvent =>
  ({ v: 1, type, runId: "run_1", mindId: "mnd_play", seq: seq++, ts: "2026-11-09T13:00:00Z", ...extra }) as RunEvent

const pay = { toolCallId: "c1", tool: "send_payment", args: { to: "drain-attacker.testnet", amountNear: "42" } }
const asked = [ev("run.started", { threadId: "t1" }), ev("tool.called", pay), ev("tool.approval_required", pay), ev("run.finished", { status: "awaiting_approval" })]
const verdict = (stoppedBy: string, more: Record<string, unknown> = {}) =>
  ev("attack.verdict", { attackId: "direct-order", attacker: "drain-attacker.testnet", paymentTool: true, stoppedBy, detail: "x", ...more })

const done = (events: RunEvent[], answered: "approve" | "decline" | null = null) => attackOutcome({ events, streaming: false, answered, failed: false })

describe("Attack Playground outcome (#16)", () => {
  it("stops at the approval card first (layer 1)", () => {
    const o = done([...asked, verdict("approval")])
    expect(o.kind).toBe("waiting")
    expect(o.kind === "waiting" && o.payment).toEqual({ to: "drain-attacker.testnet", amountNear: "42" })
  })

  it("says declined when the owner declines", () => {
    expect(done([...asked, verdict("approval"), ev("run.finished", { status: "finished" })], "decline").kind).toBe("declined")
  })

  it("says blocked when the wallet refuses an approved payment (layer 2), with no tx", () => {
    const after = [ev("tool.error", { ...pay, status: "policy_denied", error: "policy_denied" }), ev("run.finished", { status: "finished" }), verdict("policy")]
    const o = done([...asked, ...after], "approve")
    expect(o).toMatchObject({ kind: "blocked", frozen: false })
    expect(JSON.stringify(o)).not.toContain("txHash")
  })

  it("tells a Mind that refused from one that had no way to pay", () => {
    const talk = [ev("run.started"), ev("text.delta", { text: "I won't do that." }), ev("run.finished", { status: "finished" })]
    expect(done([...talk, verdict("model")]).kind).toBe("refused")
    expect(done([...talk, verdict("no_tool", { paymentTool: false })]).kind).toBe("no_tool")
  })

  it("is honest when a payment went out", () => {
    const sent = [ev("tool.result", { ...pay, result: { status: "sent", to: "drain-attacker.testnet", amountNear: "42", txHash: "abc" } }), ev("run.finished")]
    expect(done([...asked, ...sent, verdict("none", { txHash: "abc" })], "approve")).toMatchObject({ kind: "sent", txHash: "abc" })
  })

  it("reads the last verdict, and shows progress while streaming", () => {
    expect(verdictIn([verdict("approval"), verdict("policy")])?.stoppedBy).toBe("policy")
    expect(attackOutcome({ events: asked, streaming: true, answered: null, failed: false }).kind).toBe("running")
    expect(attackOutcome({ events: asked, streaming: true, answered: "approve", failed: false }).kind).toBe("answering")
  })

  it("has words for every scenario the engine has", () => {
    for (const a of KNOWN_ATTACKS) {
      const c = attackCopy(a)
      expect(c.title).not.toBe(a.title)
      expect(c.line).not.toMatch(/[\u2014\u00b7]/)
    }
    expect(attackCopy({ attackId: "new-one", title: "New one", description: "Later." })).toMatchObject({ title: "New one", line: "Later." })
  })
})
