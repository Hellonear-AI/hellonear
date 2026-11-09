import { describe, expect, it } from "vitest"
import { IDEAS } from "@/modules/autopilot/data/ideas"
import { cronOf, draftProblems, emptyDraft, fromCanvas, repeatOf, resultsBefore, toCanvas, workflowIdFor, type Draft } from "@/modules/builder/data/draft"

const draft: Draft = {
  name: "Evening wrap-up",
  repeat: "weekly",
  day: 5,
  time: "21:30",
  timezone: "Asia/Jakarta",
  steps: [
    { id: "a", kind: "agent", prompt: "  Sum up my day.  " },
    { id: "b", kind: "agent", prompt: "Give one tip." },
  ],
  branch: null,
}

describe("Builder stage 1 (#20)", () => {
  it("turns the schedule into cron and back", () => {
    expect(cronOf({ repeat: "daily", day: 1, time: "08:00" })).toBe("0 8 * * *")
    expect(cronOf({ repeat: "weekdays", day: 1, time: "07:30" })).toBe("30 7 * * 1-5")
    expect(cronOf({ repeat: "weekly", day: 5, time: "21:30" })).toBe("30 21 * * 5")
    expect(repeatOf("30 21 * * 5")).toEqual({ repeat: "weekly", day: 5, time: "21:30" })
    expect(repeatOf("0 * * * *")).toBeNull()
  })

  it("saves a canvas the engine accepts: one trigger, then a straight line", () => {
    const c = toCanvas(draft)
    expect(c.name).toBe("Evening wrap-up")
    expect(c.nodes.map((n) => n.type)).toEqual(["trigger", "agent", "agent"])
    expect(c.edges).toEqual([
      { source: "start", target: "a" },
      { source: "a", target: "b" },
    ])
    expect(c.nodes[1]).toMatchObject({ data: { prompt: "Sum up my day." } })
  })

  it("opens what it saved", () => {
    expect(fromCanvas(toCanvas(draft), "UTC")).toEqual({ ...draft, steps: draft.steps.map((s) => (s.kind === "agent" ? { ...s, prompt: s.prompt.trim() } : s)) })
    expect(fromCanvas(IDEAS[1].canvas({ timezone: "UTC", address: null }), "UTC")?.steps).toHaveLength(1)
  })

  it("stage 2: opens and saves a tool step and an If (the balance check idea)", () => {
    const balance = IDEAS[0].canvas({ timezone: "Asia/Jakarta", address: "x.testnet" })
    const d = fromCanvas(balance, "UTC")!
    expect(d.steps).toEqual([{ id: "balance", kind: "tool", tool: "near_view_account", args: { accountId: "x.testnet" } }])
    expect(d.branch).toMatchObject({ stepId: "balance", field: "balanceNear", op: "lt", right: "5", else: null })
    expect(d.branch?.then?.kind).toBe("agent")
    const again = toCanvas(d)
    expect(again.nodes.find((n) => n.type === "condition")).toMatchObject({ data: { left: "{{steps.balance.balanceNear}}", op: "lt", right: 5 } })
    expect(again.edges).toContainEqual({ source: "low", target: "note", sourceHandle: "then" })
    expect(resultsBefore(d.steps).map((r) => r.label)).toEqual(["Balance (NEAR)"])
  })

  it("says what an If still needs", () => {
    const tool = { id: "t", kind: "tool" as const, tool: "near_view_account", args: { accountId: "shop.testnet" } }
    const base: Draft = { ...draft, steps: [tool], branch: { id: "c", stepId: "t", field: "balanceNear", op: "lt", right: "", then: null, else: null } }
    expect(draftProblems(base).map((p) => p.text)).toEqual(["If: enter a number.", "If: add a step for If yes."])
    expect(draftProblems({ ...base, steps: [{ ...tool, args: { accountId: "Not An Account!" } }] }).some((p) => p.where === "t")).toBe(true)
    const text: Draft = { ...draft, steps: [{ id: "n", kind: "tool", tool: "get_time", args: {} }], branch: { id: "c", stepId: "n", field: "weekday", op: "eq", right: "Friday", then: { id: "y", kind: "agent", prompt: "Weekend plan." }, else: null } }
    expect(draftProblems(text)).toEqual([])
    expect(toCanvas(text).nodes.find((n) => n.type === "condition")).toMatchObject({ data: { right: "Friday" } })
    // Engine rule: both ways can't ask the Mind.
    const both: Draft = { ...text, branch: { ...text.branch!, else: { id: "n2", kind: "agent", prompt: "Other." } } }
    expect(draftProblems(both).map((p) => p.where)).toEqual(["n2"])
  })

  it("makes a job id from the name, unique and never the Builder's own route", () => {
    expect(workflowIdFor("Evening wrap-up!", [])).toBe("evening-wrap-up")
    expect(workflowIdFor("Evening wrap-up", ["evening-wrap-up"])).toBe("evening-wrap-up-2")
    expect(workflowIdFor("New", [])).toBe("job")
    expect(workflowIdFor("!!!", [])).toBe("job")
  })

  it("says what stops Save", () => {
    expect(draftProblems(emptyDraft("UTC")).map((p) => p.where)).toEqual(["name", "steps"])
    expect(draftProblems({ ...draft, steps: [{ id: "x", kind: "agent", prompt: " " }] }).map((p) => p.where)).toEqual(["x"])
    expect(draftProblems(draft)).toEqual([])
  })
})
