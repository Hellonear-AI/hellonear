import { describe, expect, it } from "vitest"
import { ACTION_RULES, isValidMaxNear, overWalletLimit, rulesFor, sameRules } from "@/modules/settings/data/autoApprove"
import { foldRun, type RunEvent } from "@/modules/runs/data/events"

const ev = (seq: number, type: string, extra: Partial<RunEvent> = {}): RunEvent => ({ v: 1, type, runId: "r1", mindId: "m1", seq, ts: new Date(1_700_000_000_000 + seq * 1000).toISOString(), ...extra })

describe("auto-approve rules (#167)", () => {
  it("offers a switch only for actions the Mind's skills have", () => {
    expect(rulesFor(new Set(["googlecalendar_create_event", "get_time"])).map((r) => r.tool)).toEqual(["googlecalendar_create_event"])
    expect(rulesFor(new Set())).toEqual([])
    expect(ACTION_RULES.some((r) => r.tool === "send_payment")).toBe(false)
  })

  it("checks the payment amount like the backend", () => {
    expect(isValidMaxNear("0.1")).toBe(true)
    expect(isValidMaxNear("10")).toBe(true)
    expect(isValidMaxNear("0")).toBe(false)
    expect(isValidMaxNear("11")).toBe(false)
    expect(isValidMaxNear("abc")).toBe(false)
    expect(overWalletLimit("0.5", "0.1")).toBe(true)
    expect(overWalletLimit("0.1", "0.1")).toBe(false)
    expect(overWalletLimit("0.5", null)).toBe(false)
  })

  it("compares rules without caring about order", () => {
    expect(sameRules({ tools: ["a", "b"], payment: null }, { tools: ["b", "a"], payment: null })).toBe(true)
    expect(sameRules({ tools: [], payment: { maxNear: "0.1" } }, { tools: [], payment: null })).toBe(false)
  })

  it("a tool the owner's rule approved is marked, and never waits for an answer", () => {
    const view = foldRun([
      ev(0, "run.started"),
      ev(1, "tool.called", { toolCallId: "c1", tool: "send_payment", args: { to: "alice.testnet", amountNear: "0.01" }, approvedBy: "rule" }),
      ev(2, "tool.result", { toolCallId: "c1", tool: "send_payment", result: { paymentId: "p1", status: "sent", to: "alice.testnet", amountNear: "0.01", txHash: "T" }, status: "ok" }),
      ev(3, "run.finished"),
    ])
    expect(view.tools[0]).toMatchObject({ toolCallId: "c1", status: "ok", approvedByRule: true })
    expect(view.status).toBe("finished")
    const plain = foldRun([ev(0, "run.started"), ev(1, "tool.called", { toolCallId: "c2", tool: "get_time", args: {} })])
    expect(plain.tools[0].approvedByRule).toBeUndefined()
  })
})
