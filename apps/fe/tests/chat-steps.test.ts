import { describe, expect, it } from "vitest"
import { foldRun, type RunEvent, type ToolStep } from "@/modules/chat/data/events"
import { stepDuration, stepText, summaryLabel } from "@/modules/chat/data/steps"
import { lines } from "@/modules/chat/components/ReplySteps"
import { closeOpenMarks } from "@/modules/chat/components/ReplyText"

const step = (tool: string, status: ToolStep["status"], result?: unknown, args?: unknown): ToolStep => ({ toolCallId: "c", tool, status, args, result })

describe("stepText", () => {
  it("says what it is doing, then what it did with a short result", () => {
    expect(stepText(step("get_balance", "running"))).toEqual({ label: "Checking the balance...", detail: null, tone: "doing" })
    expect(stepText(step("get_balance", "ok", { address: "a", balanceNear: "4.791" }))).toEqual({ label: "Checked the balance", detail: "4.79 NEAR", tone: "done" })
    expect(stepText(step("gmail_list_emails", "ok", { emails: [{}, {}] })).detail).toBe("2 emails")
    expect(stepText(step("http_request", "ok", { status: 200 }, { url: "https://httpbin.org/headers" })).detail).toBe("httpbin.org")
    expect(stepText(step("http_request", "ok", { status: 404 }, { url: "https://httpbin.org/nope" })).detail).toBe("httpbin.org returned an error")
  })
  it("says when a step didn't work, and never uses a dot separator", () => {
    expect(stepText(step("get_balance", "error"))).toMatchObject({ detail: "failed", tone: "failed" })
    expect(stepText(step("something_new", "ok")).label).toBe("Used a tool")
    for (const s of ["running", "ok", "error", "declined"] as const) expect(JSON.stringify(stepText(step("get_balance", s)))).not.toContain("·")
  })
})

describe("Paid data steps (#150)", () => {
  it("say a price was asked, then that the report was bought", () => {
    expect(stepText(step("buy_data", "running"))).toMatchObject({ label: "Buying a report..." })
    expect(stepText(step("buy_data", "ok", { status: "payment_required", priceNear: "0.001" }))).toEqual({ label: "Asked for a report", detail: "price 0.001 NEAR", tone: "done" })
    expect(stepText(step("buy_data", "ok", { status: "paid" })).detail).toBe("bought, report received")
    expect(stepText(step("buy_data", "ok", { status: "refused" })).detail).toBe("not sold")
  })
})

describe("lines (step details, no code font)", () => {
  it("turns fields into readable lines and cuts long values", () => {
    expect(lines({ balanceNear: "4.79", to_account: "x.testnet" })).toEqual([
      ["Balance NEAR", "4.79"],
      ["To account", "x.testnet"],
    ])
    expect(lines({ emails: [{}, {}, {}] })).toEqual([["Emails", "3 items"]])
    expect(lines({ attendees: ["budi@example.com"] })).toEqual([["Attendees", "budi@example.com"]])
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

describe("summaryLabel (folded steps)", () => {
  it("says how long the Mind worked in all, then the steps, with no dot separators", () => {
    expect(summaryLabel(4, 20_000)).toBe("Worked for 20s, used 4 steps")
    expect(summaryLabel(1, 400)).toBe("Worked for 1s, used 1 step")
    expect(summaryLabel(0, 65_000)).toBe("Worked for 1m 05s")
  })
})

describe("time worked", () => {
  let seq = 0
  const ev = (type: string, ts: string, extra: Partial<RunEvent> = {}): RunEvent => ({ v: 1, type, runId: "r", mindId: "m", seq: seq++, ts: `2026-11-09T10:${ts}Z`, ...extra })
  it("spans the run and gives each tool its own time", () => {
    seq = 0
    const v = foldRun([
      ev("run.started", "00:00"),
      ev("tool.called", "00:02", { toolCallId: "c1", tool: "googlecalendar_list_events" }),
      ev("tool.result", "00:08", { toolCallId: "c1", tool: "googlecalendar_list_events", status: "ok", result: { events: [] } }),
      ev("text.delta", "00:15", { text: "Hi" }),
      ev("run.finished", "00:20"),
    ])
    expect(v.workMs).toBe(20_000)
    expect(stepDuration(v.tools[0])).toBe("6s")
  })
  it("leaves out the wait for the owner's approval", () => {
    seq = 0
    const v = foldRun([
      ev("run.started", "00:00"),
      ev("tool.approval_required", "00:04", { toolCallId: "c1", tool: "send_payment" }),
      ev("run.finished", "00:05"),
      // The owner answered three minutes later.
      ev("step.started", "03:05"),
      ev("tool.result", "03:07", { toolCallId: "c1", tool: "send_payment", status: "ok", result: { status: "sent" } }),
      ev("run.finished", "03:10"),
    ])
    expect(v.workMs).toBe(10_000)
  })
})
