import { describe, expect, it } from "vitest"
import { foldRun, type RunEvent } from "@/modules/chat/data/events"

let seq = 0
const ev = (type: string, extra: Partial<RunEvent> = {}): RunEvent => ({ v: 1, type, runId: "r1", mindId: "m1", seq: ++seq, ts: "2026-11-10T10:00:00Z", ...extra })

describe("Stop (#121)", () => {
  it("reads a stopped run as canceled and keeps what it said so far", () => {
    const view = foldRun([ev("run.started", { threadId: "t1" }), ev("text.delta", { text: "Half an ans" }), ev("run.finished", { status: "canceled" })])
    expect(view.status).toBe("canceled")
    expect(view.text).toBe("Half an ans")
    expect(view.verified).toBeNull()
  })

  it("still reads a normal end as finished", () => {
    expect(foldRun([ev("run.started"), ev("text.delta", { text: "Hi" }), ev("run.finished", { status: "finished" })]).status).toBe("finished")
  })

  it("marks a tool still running at Stop as stopped, not running", () => {
    const view = foldRun([ev("run.started"), ev("tool.called", { tool: "get_balance", toolCallId: "a" }), ev("run.finished", { status: "canceled" })])
    expect(view.tools[0].status).toBe("stopped")
  })
})
