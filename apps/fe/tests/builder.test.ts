import { describe, expect, it } from "vitest"
import { IDEAS } from "@/modules/autopilot/data/ideas"
import { cronOf, draftProblems, emptyDraft, fromCanvas, moveStepIn, repeatOf, resultsBefore, toCanvas, workflowIdFor, type Draft } from "@/modules/builder/data/draft"

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

describe("Builder Test run (B1.2)", () => {
  it("says in a few words what each block did", async () => {
    const { nodeSummary } = await import("@/modules/builder/data/testRun")
    expect(nodeSummary({ accountId: "x", balanceNear: 0.7488 })).toBe("Balance 0.7488 NEAR")
    expect(nodeSummary({ text: "Top it up." })).toBe("Top it up.")
    expect(nodeSummary({ weekday: "Monday", time: "21:15" })).toBe("Monday, 21:15")
    expect(nodeSummary({ events: [{}, {}] })).toBe("2 events")
    expect(nodeSummary(null)).toBe("Done")
  })
})

describe("Builder website block", () => {
  const web = { id: "w", kind: "http" as const, method: "GET" as const, url: "https://status.example.com/health", key: "SHOP_TOKEN", body: "" }
  const job: Draft = {
    name: "Status check",
    repeat: "daily",
    day: 1,
    time: "09:00",
    timezone: "UTC",
    steps: [web],
    branch: { id: "c", stepId: "w", field: "status", op: "gte", right: "400", then: { id: "y", kind: "agent", prompt: "Tell me the site is down." }, else: null },
  }

  it("saves an http node with the key as a Bearer secret, and opens it again", () => {
    const c = toCanvas(job)
    expect(c.nodes.find((n) => n.type === "http")).toMatchObject({ data: { method: "GET", url: web.url, headers: { Authorization: "Bearer {{secrets.SHOP_TOKEN}}" } } })
    expect(c.nodes.find((n) => n.type === "condition")).toMatchObject({ data: { left: "{{steps.w.status}}", right: 400 } })
    expect(fromCanvas(c, "UTC")?.steps[0]).toEqual(web)
    expect(resultsBefore(job.steps).map((r) => r.label)).toEqual(["Status code (like 200)", "Answer"])
  })

  it("wants an https address and leaves headers it can't show alone", () => {
    expect(draftProblems({ ...job, steps: [{ ...web, url: "http://x.com" }] }).some((p) => p.where === "w")).toBe(true)
    expect(draftProblems(job)).toEqual([])
    const odd = toCanvas(job)
    const http = odd.nodes.find((n) => n.type === "http")!
    if (http.type === "http") http.data.headers = { "X-Api-Key": "abc" }
    expect(fromCanvas(odd, "UTC")).toBeNull()
  })
})

describe("Builder drag and drop (B1.7)", () => {
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join("")
  const line = [{ id: "a" }, { id: "b" }, { id: "c" }]
  it("moves a step to the spot it was dropped on", () => {
    expect(ids(moveStepIn(line, "c", 0))).toBe("cab")
    expect(ids(moveStepIn(line, "a", 3))).toBe("bca")
    expect(ids(moveStepIn(line, "a", 2))).toBe("bac")
    expect(ids(moveStepIn(line, "x", 0))).toBe("abc")
  })
})

describe("Builder autosave (on this device)", () => {
  it("keeps, reads and drops a draft per Mind and job, and survives blocked storage", async () => {
    const { vi } = await import("vitest")
    const store = new Map<string, string>()
    vi.stubGlobal("window", {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    })
    const { dropDraft, keepDraft, readDraft } = await import("@/modules/builder/data/autosave")
    keepDraft("m1", null, draft, new Date("2026-11-09T14:00:00Z"))
    expect(readDraft("m1", null)).toEqual({ draft, at: "2026-11-09T14:00:00.000Z" })
    expect(readDraft("m1", "other-job")).toBeNull()
    dropDraft("m1", null)
    expect(readDraft("m1", null)).toBeNull()
    store.set("hellonear.builder.m1.bad", "{not json")
    expect(readDraft("m1", "bad")).toBeNull()
    vi.stubGlobal("window", { localStorage: { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") }, removeItem: () => { throw new Error("blocked") } } })
    expect(readDraft("m1", null)).toBeNull()
    expect(() => keepDraft("m1", null, draft)).not.toThrow()
    vi.unstubAllGlobals()
  })
})

describe("Builder canvas pan and zoom", () => {
  it("zooms around the pointer and fits the job, never above 100%", async () => {
    const { fitView, zoomAround, MAX_ZOOM, MIN_ZOOM } = await import("@/modules/builder/hooks/useCanvasView")
    // The point under the pointer stays put.
    const v = zoomAround({ x: 100, y: 50, zoom: 1 }, 2, 300, 250)
    expect((300 - v.x) / v.zoom).toBeCloseTo((300 - 100) / 1)
    expect((250 - v.y) / v.zoom).toBeCloseTo((250 - 50) / 1)
    expect(zoomAround({ x: 0, y: 0, zoom: 1 }, 99, 0, 0).zoom).toBe(MAX_ZOOM)
    expect(zoomAround({ x: 0, y: 0, zoom: 1 }, 0.01, 0, 0).zoom).toBe(MIN_ZOOM)
    // A small job fits at 100%, centered; a tall one shrinks to fit.
    expect(fitView({ w: 1000, h: 800 }, { w: 640, h: 400 })).toEqual({ zoom: 1, x: 180, y: 200 })
    expect(fitView({ w: 1000, h: 600 }, { w: 640, h: 1008 }).zoom).toBeCloseTo(0.5)
  })
})

describe("Builder wheel feel (gentler, 9 Nov)", () => {
  it("turns any wheel into pixels and zooms about 18% per mouse notch, capped", async () => {
    const { wheelPixels, wheelZoomFactor } = await import("@/modules/builder/hooks/useCanvasView")
    expect(wheelPixels({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toEqual({ dx: 0, dy: 48 })
    expect(wheelPixels({ deltaX: 5, deltaY: 10, deltaMode: 0 })).toEqual({ dx: 5, dy: 10 })
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.221, 2)
    expect(wheelZoomFactor(100)).toBeCloseTo(0.819, 2)
    // A fast wheel's big delta counts as one notch, so it can't jump.
    expect(wheelZoomFactor(-1000)).toBeCloseTo(wheelZoomFactor(-120))
    // A trackpad pinch sends small deltas: small steps.
    expect(wheelZoomFactor(-4)).toBeCloseTo(1.008, 3)
  })
})
