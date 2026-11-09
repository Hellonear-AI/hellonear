import { describe, expect, it } from "vitest"
import { IDEAS } from "@/modules/autopilot/data/ideas"
import { cronOf, draftProblems, emptyDraft, fromCanvas, repeatOf, toCanvas, workflowIdFor, type Draft } from "@/modules/builder/data/draft"

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

  it("opens what it saved, and leaves jobs with tools or an If alone", () => {
    expect(fromCanvas(toCanvas(draft), "UTC")).toEqual({ ...draft, steps: draft.steps.map((s) => ({ ...s, prompt: s.prompt.trim() })) })
    const balance = IDEAS[0].canvas({ timezone: "UTC", address: "x.testnet" })
    expect(fromCanvas(balance, "UTC")).toBeNull()
    expect(fromCanvas(IDEAS[1].canvas({ timezone: "UTC", address: null }), "UTC")?.steps).toHaveLength(1)
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
