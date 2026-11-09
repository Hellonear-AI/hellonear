import { describe, expect, it } from "vitest"
import { foldRun, type RunEvent, type ToolStep } from "@/modules/chat/data/events"
import { stepText } from "@/modules/chat/data/steps"
import { lines } from "@/modules/chat/components/ReplySteps"
import { closeOpenMarks } from "@/modules/chat/components/ReplyText"

const step = (tool: string, status: ToolStep["status"], result?: unknown, args?: unknown): ToolStep => ({ toolCallId: "c", tool, status, args, result })

describe("stepText", () => {
  it("says what it is doing, then what it did with a short result", () => {
    expect(stepText(step("get_balance", "running"))).toEqual({ label: "Checking the balance...", detail: null, tone: "doing" })
    expect(stepText(step("get_balance", "ok", { address: "a", balanceNear: "4.791" }))).toEqual({ label: "Checked the balance", detail: "4.79 NEAR", tone: "done" })
    expect(stepText(step("gmail_list_emails", "ok", { emails: [{}, {}] })).detail).toBe("2 emails")
    expect(stepText(step("http_request", "ok", { status: 404 })).detail).toBe("it returned an error")
  })
  it("says when a step didn't work, and never uses a dot separator", () => {
    expect(stepText(step("get_balance", "error"))).toMatchObject({ detail: "didn't work", tone: "failed" })
    expect(stepText(step("something_new", "ok")).label).toBe("Used a tool")
    for (const s of ["running", "ok", "error", "declined"] as const) expect(JSON.stringify(stepText(step("get_balance", s)))).not.toContain("·")
  })
})

describe("lines (step details, no code font)", () => {
  it("turns fields into readable lines and cuts long values", () => {
    expect(lines({ balanceNear: "4.79", to_account: "x.testnet" })).toEqual([
      ["Balance NEAR", "4.79"],
      ["To account", "x.testnet"],
    ])
    expect(lines({ emails: [1, 2, 3] })).toEqual([["Emails", "3 items"]])
    expect(lines("x".repeat(300))[0][1]).toHaveLength(283)
  })
})

describe("thought parts", () => {
  it("keeps a stretch of reasoning with when it started and last wrote", () => {
    let seq = 0
    const ev = (type: string, ts: string, extra: Partial<RunEvent> = {}): RunEvent => ({ v: 1, type, runId: "r", mindId: "m", seq: seq++, ts, ...extra })
    const v = foldRun([
      ev("reasoning.delta", "2026-11-09T10:00:00Z", { text: "Check " }),
      ev("reasoning.delta", "2026-11-09T10:00:04Z", { text: "balance" }),
      ev("tool.called", "2026-11-09T10:00:05Z", { toolCallId: "c1", tool: "get_balance" }),
    ])
    expect(v.parts[0]).toEqual({ kind: "thought", text: "Check balance", from: "2026-11-09T10:00:00Z", to: "2026-11-09T10:00:04Z" })
    expect(v.parts[1]).toEqual({ kind: "tool", toolCallId: "c1" })
  })
})

describe("closeOpenMarks (Markdown while streaming)", () => {
  it("closes a bold or code mark that hasn't arrived yet", () => {
    expect(closeOpenMarks("Kirim **0.1 NEAR ke `ancung")).toBe("Kirim **0.1 NEAR ke `ancung`**")
    expect(closeOpenMarks("Kirim **0.1 NE")).toBe("Kirim **0.1 NE**")
    expect(closeOpenMarks("**done** and `x`")).toBe("**done** and `x`")
    expect(closeOpenMarks("```\ncode")).toBe("```\ncode")
  })
})

describe("skill steps", () => {
  it("name the skill as people know it", () => {
    expect(stepText({ toolCallId: "c", tool: "skill", status: "ok", args: { name: "daily-planner" }, result: {} }).detail).toBe("Daily planner")
  })
})
