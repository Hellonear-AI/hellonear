import { describe, expect, it } from "vitest"
import { IDEAS } from "@/modules/autopilot/data/ideas"
import {
  carriesOn,
  cronOf,
  draftProblems,
  emptyDraft,
  fromCanvas,
  isStep,
  notesBefore,
  repeatOf,
  resultsBefore,
  toCanvas,
  workflowIdFor,
  type Block,
  type Draft,
  type IfBlock,
} from "@/modules/builder/data/draft"

const stepsOf = (d: Draft | null | undefined) => d?.line.filter(isStep) ?? []
const ifOf = (d: Draft | null | undefined) => d?.line.find((b): b is IfBlock => b.kind === "if")
const job = (line: Block[]): Draft => ({ name: "Watch", repeat: "daily", day: 1, time: "09:00", timezone: "UTC", line })

const draft: Draft = {
  name: "Evening wrap-up",
  repeat: "weekly",
  day: 5,
  time: "21:30",
  timezone: "Asia/Jakarta",
  line: [
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

  it("opens what it saved", () => {
    expect(fromCanvas(toCanvas(draft), "UTC")).toEqual({ ...draft, line: draft.line.map((s) => (s.kind === "agent" ? { ...s, prompt: s.prompt.trim() } : s)) })
    expect(fromCanvas(IDEAS[1].canvas({ timezone: "UTC", address: null }), "UTC")?.line).toHaveLength(1)
  })

  it("stage 2: opens and saves a tool step and an If (the balance check idea)", () => {
    const balance = IDEAS[0].canvas({ timezone: "Asia/Jakarta", address: "x.testnet" })
    const d = fromCanvas(balance, "UTC")!
    expect(stepsOf(d)).toEqual([{ id: "balance", kind: "tool", tool: "near_view_account", args: { accountId: "x.testnet" } }])
    expect(ifOf(d)).toMatchObject({ stepId: "balance", field: "balanceNear", op: "lt", right: "5", else: [] })
    expect(ifOf(d)?.then[0]?.kind).toBe("agent")
    const again = toCanvas(d)
    expect(again.nodes.find((n) => n.type === "condition")).toMatchObject({ data: { left: "{{steps.balance.balanceNear}}", op: "lt", right: 5 } })
    expect(again.edges).toContainEqual({ source: "low", target: "note", sourceHandle: "then" })
    expect(resultsBefore(stepsOf(d)).map((r) => r.label)).toEqual(["Balance (NEAR)"])
  })

  it("says what an If still needs", () => {
    const tool = { id: "t", kind: "tool" as const, tool: "near_view_account", args: { accountId: "shop.testnet" } }
    const iff: IfBlock = { id: "c", kind: "if", stepId: "t", field: "balanceNear", op: "lt", right: "", then: [], else: [] }
    expect(draftProblems({ ...draft, line: [tool, iff] }).map((p) => p.text)).toEqual(["Enter a number in the If block.", "Add a step to If yes or If no."])
    expect(draftProblems({ ...draft, line: [{ ...tool, args: { accountId: "Not An Account!" } }, iff] }).some((p) => p.where === "t")).toBe(true)
    const time = { id: "n", kind: "tool" as const, tool: "get_time", args: {} }
    const weekend: IfBlock = { id: "c", kind: "if", stepId: "n", field: "weekday", op: "eq", right: "Friday", then: [{ id: "y", kind: "agent", prompt: "Weekend plan." }], else: [] }
    expect(draftProblems({ ...draft, line: [time, weekend] })).toEqual([])
    expect(toCanvas({ ...draft, line: [time, weekend] }).nodes.find((n) => n.type === "condition")).toMatchObject({ data: { right: "Friday" } })
    // Two ways of one Ask each would share one input.
    const both = { ...draft, line: [time, { ...weekend, else: [{ id: "n2", kind: "agent" as const, prompt: "Other." }] }] }
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
    expect(draftProblems({ ...draft, line: [{ id: "x", kind: "agent", prompt: " " }] }).map((p) => p.where)).toEqual(["x"])
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
  const site: Draft = {
    name: "Status check",
    repeat: "daily",
    day: 1,
    time: "09:00",
    timezone: "UTC",
    line: [web, { id: "c", kind: "if", stepId: "w", field: "status", op: "gte", right: "400", then: [{ id: "y", kind: "agent", prompt: "Tell me the site is down." }], else: [] }],
  }

  it("saves an http node with the key as a Bearer secret, and opens it again", () => {
    const c = toCanvas(site)
    expect(c.nodes.find((n) => n.type === "http")).toMatchObject({ data: { method: "GET", url: web.url, headers: { Authorization: "Bearer {{secrets.SHOP_TOKEN}}" } } })
    expect(c.nodes.find((n) => n.type === "condition")).toMatchObject({ data: { left: "{{steps.w.status}}", right: 400 } })
    expect(fromCanvas(c, "UTC")?.line[0]).toEqual(web)
    expect(resultsBefore([web]).map((r) => r.label)).toEqual(["Status code (like 200)", "Answer"])
  })

  it("wants an https address and leaves headers it can't show alone", () => {
    expect(draftProblems({ ...site, line: [{ ...web, url: "http://x.com" }, site.line[1]] }).some((p) => p.where === "w")).toBe(true)
    expect(draftProblems(site)).toEqual([])
    const odd = toCanvas(site)
    const http = odd.nodes.find((n) => n.type === "http")!
    if (http.type === "http") http.data.headers = { "X-Api-Key": "abc" }
    expect(fromCanvas(odd, "UTC")).toBeNull()
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

describe("Builder Shift + scroll", () => {
  it("pans sideways whether the browser sends deltaX or deltaY", async () => {
    const { wheelPan } = await import("@/modules/builder/hooks/useCanvasView")
    expect(wheelPan({ dx: 0, dy: 100, shift: true })).toEqual({ x: 100, y: 0 })
    expect(wheelPan({ dx: 100, dy: 0, shift: true })).toEqual({ x: 100, y: 0 })
    expect(wheelPan({ dx: 3, dy: 40, shift: false })).toEqual({ x: 3, y: 40 })
  })
})

describe("Builder grid when zoomed out", () => {
  it("never puts dots closer than 14 px on screen, and fades them a little zoomed out", async () => {
    const { gridOf } = await import("@/modules/builder/hooks/useCanvasView")
    expect(gridOf(1)).toEqual({ spacing: 20, opacity: 1 })
    expect(gridOf(0.25).spacing).toBe(20)
    expect(gridOf(0.5).spacing).toBe(20)
    expect(gridOf(0.6).spacing).toBeCloseTo(24)
    for (const z of [0.25, 0.3, 0.45, 0.7, 1, 1.5, 2]) {
      expect(gridOf(z).spacing).toBeGreaterThanOrEqual(14)
      expect(gridOf(z).spacing).toBeLessThan(41)
    }
    expect(gridOf(0.25).opacity).toBeLessThan(0.75)
  })
})

describe("TimePicker minutes", () => {
  it("offers every 5 minutes, and keeps a saved odd minute pickable", async () => {
    const { minuteChoices } = await import("@/components/elements/TimePicker")
    expect(minuteChoices("15")).toHaveLength(12)
    expect(minuteChoices("32")).toContain("32")
    expect(minuteChoices("32").indexOf("32")).toBe(minuteChoices("32").indexOf("30") + 1)
  })
})

describe("Builder If ways, as in n8n (10 Nov)", () => {
  const tool = { id: "t", kind: "tool" as const, tool: "near_view_account", args: { accountId: "shop.testnet" } }
  const check = (then: Block[], els: Block[]): IfBlock => ({ id: "c", kind: "if", stepId: "t", field: "balanceNear", op: "lt", right: "5", then, else: els })

  it("saves an empty Yes with a step on No as the opposite check", () => {
    const web = { id: "w", kind: "http" as const, method: "POST" as const, url: "https://hooks.example.com/x", key: "", body: "Low" }
    const d = job([tool, check([], [web])])
    const c = toCanvas(d)
    expect(c.nodes.find((n) => n.type === "condition")).toMatchObject({ data: { op: "gte", right: 5 } })
    expect(c.edges).toContainEqual({ source: "c", target: "w", sourceHandle: "then" })
    expect(draftProblems(d)).toEqual([])
  })

  it("lets a way hold a tool or a website, and opens it again", () => {
    const d = job([tool, check([{ id: "n", kind: "tool", tool: "get_time", args: {} }], [])])
    expect(ifOf(fromCanvas(toCanvas(d), "UTC"))?.then).toEqual([{ id: "n", kind: "tool", tool: "get_time", args: {} }])
  })

  it("needs a step on at least one way, and two one-Ask ways can't both ask", () => {
    expect(draftProblems(job([tool, check([], [])])).map((p) => p.text)).toEqual(["Add a step to If yes or If no."])
    const both = job([tool, check([{ id: "a", kind: "agent", prompt: "x" }], [{ id: "b", kind: "agent", prompt: "y" }])])
    expect(draftProblems(both).map((p) => p.where)).toEqual(["b"])
  })

  it("names whose balance an earlier result is", () => {
    const self = { name: "Omaga", address: "a".repeat(64) }
    const own = { ...tool, args: { accountId: self.address } }
    const other = { ...tool, id: "t2", args: { accountId: "lin1er.testnet" } }
    expect(resultsBefore([own, other], undefined, self).map((r) => r.source)).toEqual(["Omaga's wallet", "lin1er.testnet"])
  })

})

describe("Autopilot run text (10 Nov)", () => {
  it("sums up a Markdown note as one plain line", async () => {
    const { plainText } = await import("@/modules/autopilot/data/runs")
    expect(plainText("Good morning!\n## 💰 Wallet **5.39 NEAR** [link](https://x.io)\n- one")).toBe("Good morning! 💰 Wallet 5.39 NEAR link one")
  })
})

describe("Prompt chips (10 Nov)", () => {
  it("splits a prompt into text and named result chips", async () => {
    const { promptParts } = await import("@/modules/builder/data/draft")
    const results = [
      { stepId: "t", name: "balanceNear", label: "Balance (NEAR)", who: "Omaga", stepKind: "tool" as const },
      { stepId: "w", name: "body", label: "Answer", stepKind: "http" as const },
    ]
    expect(promptParts("Has {{steps.t.balanceNear}} NEAR, price {{steps.w.body}}. {{steps.x.y}}", results)).toEqual([
      { text: "Has " },
      { chip: "Balance of Omaga", ref: "{{steps.t.balanceNear}}", tone: "tool" },
      { text: " NEAR, price " },
      { chip: "Answer", ref: "{{steps.w.body}}", tone: "http" },
      { text: ". {{steps.x.y}}" },
    ])
  })
})

describe("Add to my calendar and Email me (#146)", () => {
  const brief: Draft = {
    ...draft,
    line: [
      { id: "note", kind: "agent", prompt: "Write my morning brief." },
      { id: "cal", kind: "tool", tool: "googlecalendar_block_time", args: { title: "Focus time", at: "09:00", minutes: "30" } },
      { id: "mail", kind: "tool", tool: "mail_send_to_owner", args: { subject: "Your morning", text: "{{steps.note.text}}" } },
    ],
  }

  it("saves both as tool steps and opens them again", () => {
    const c = toCanvas(brief)
    expect(c.nodes.slice(2).map((n) => n.data)).toEqual([
      { tool: "googlecalendar_block_time", args: { title: "Focus time", at: "09:00", minutes: "30" } },
      { tool: "mail_send_to_owner", args: { subject: "Your morning", text: "{{steps.note.text}}" } },
    ])
    expect(fromCanvas(c, "UTC")?.line).toEqual(brief.line)
  })

  it("Email me offers only the notes earlier Ask steps wrote", () => {
    const steps = [{ id: "bal", kind: "tool" as const, tool: "near_view_account", args: { accountId: "shop.testnet" } }, ...stepsOf(brief)]
    expect(notesBefore(steps, 3).map((n) => `${n.stepId}.${n.name}`)).toEqual(["note.text"])
    expect(notesBefore(steps, 1)).toEqual([])
  })

  it("needs a name, a time, 5 to 480 minutes, a subject and an email", () => {
    const bad: Draft = { ...brief, line: [{ id: "cal", kind: "tool", tool: "googlecalendar_block_time", args: { title: " ", at: "9", minutes: "2" } }, { id: "mail", kind: "tool", tool: "mail_send_to_owner", args: { subject: "", text: "" } }] }
    expect(draftProblems(bad).map((p) => p.text)).toEqual([
      "Event name is required.",
      "Time is required.",
      "Minutes must be a whole number from 5 to 480.",
      "Subject is required.",
      "Email is required.",
    ])
    expect(draftProblems(brief)).toEqual([])
  })
})

describe("run lines for Add to my calendar and Email me (#146)", () => {
  it("say what happened, and that a try-out sample did nothing", async () => {
    const { nodeSummary } = await import("@/modules/builder/data/testRun")
    expect(nodeSummary({ source: "googlecalendar", status: "created", title: "Focus time", start: "2026-11-11T09:00:00+07:00" })).toBe('Added "Focus time" at 09:00 to your calendar')
    expect(nodeSummary({ source: "sample_calendar", status: "created", title: "Focus time", start: "2026-11-11T09:00:00+07:00" })).toBe('Sample only: "Focus time" at 09:00 was not added to a real calendar')
    expect(nodeSummary({ sendId: "m1", status: "sent", to: ["owner@gmail.example"] })).toBe("Emailed you at owner@gmail.example")
    expect(nodeSummary({ sendId: "mail_sample", status: "sent", sample: true })).toBe("Sample only: no email was sent")
    expect(nodeSummary({ sendId: "m2", status: "rejected", message: "limit: 20 emails per Mind per day" })).toBe("Not sent: limit: 20 emails per Mind per day")
  })
})

describe("Ifs anywhere and End (#164)", () => {
  const bal = { id: "bal", kind: "tool" as const, tool: "near_view_account", args: { accountId: "shop.testnet" } }
  const time = { id: "time", kind: "tool" as const, tool: "get_time", args: {} }
  const note = { id: "note", kind: "agent" as const, prompt: "Say the balance and the time." }
  const urgent = { id: "urgent", kind: "agent" as const, prompt: "Urgent." }
  const end = (id: string) => ({ id, kind: "end" as const })
  const low: IfBlock = {
    id: "low",
    kind: "if",
    stepId: "bal",
    field: "balanceNear",
    op: "lt",
    right: "10",
    then: [{ id: "very", kind: "if", stepId: "bal", field: "balanceNear", op: "lt", right: "2", then: [urgent, end("e1")], else: [note] }],
    else: [time],
  }
  const tree = job([bal, low, { id: "after", kind: "agent", prompt: "Wrap up." }])

  it("saves the tree as the engine wants it and opens it again", () => {
    const c = toCanvas(tree)
    expect(c.edges).toContainEqual({ source: "low", target: "very", sourceHandle: "then" })
    expect(c.edges).toContainEqual({ source: "very", target: "urgent", sourceHandle: "then" })
    expect(c.edges).toContainEqual({ source: "urgent", target: "e1" })
    expect(c.edges).toContainEqual({ source: "low", target: "time", sourceHandle: "else" })
    // What follows an If hangs off it with a plain edge.
    expect(c.edges).toContainEqual({ source: "low", target: "after" })
    expect(c.nodes.find((n) => n.id === "e1")).toMatchObject({ type: "end", data: {} })
    expect(fromCanvas(c, "UTC")?.line).toEqual(tree.line)
    expect(draftProblems(tree)).toEqual([])
  })

  it("lets a step read only what came before it on its own path", async () => {
    const { stepsBefore, stepsAt } = await import("@/modules/builder/data/draft")
    expect(stepsBefore(tree.line, "urgent").map((s) => s.id)).toEqual(["bal"])
    expect(stepsBefore(tree.line, "time").map((s) => s.id)).toEqual(["bal"])
    // After an If its ways may not have run, so they can't be read.
    expect(stepsBefore(tree.line, "after").map((s) => s.id)).toEqual(["bal"])
    expect(stepsAt(tree.line, [{ at: "low", h: "else" }], 1).map((s) => s.id)).toEqual(["bal", "time"])
  })

  it("puts End only at the end of a path, nothing after a path that ends, and an If only after something to check", async () => {
    const { canPlace, closes } = await import("@/modules/builder/data/draft")
    const way = [{ at: "low", h: "then" as const }, { at: "very", h: "then" as const }]
    expect(canPlace(tree.line, way, 2, "agent")).toBe(false)
    expect(canPlace(tree.line, way, 1, "end")).toBe(false)
    expect(canPlace(tree.line, [{ at: "low", h: "else" }], 1, "end")).toBe(true)
    expect(canPlace(tree.line, [], 0, "if")).toBe(false)
    expect(canPlace(tree.line, [], 1, "if")).toBe(true)
    // Like n8n: nothing goes after an If; a path goes on inside its Yes and No.
    expect(canPlace(tree.line, [], 2, "agent")).toBe(false)
    expect(canPlace(tree.line, [{ at: "low", h: "else" }], 1, "if")).toBe(true)
    // An If whose ways both end closes the path.
    expect(closes({ ...low, then: [end("x")], else: [end("y")] })).toBe(true)
    const shut = job([bal, { ...low, then: [end("x")], else: [end("y")] }, note])
    expect(draftProblems(shut).map((p) => p.where)).toContain("note")
  })

  it("moves a block and takes one out with its ways", async () => {
    const { removeBlock, insertBlock, locate } = await import("@/modules/builder/data/draft")
    expect(locate(tree.line, "note")).toEqual({ path: [{ at: "low", h: "then" }, { at: "very", h: "else" }], index: 0 })
    const out = removeBlock(tree.line, "very")
    expect(locate(out, "urgent")).toBeNull()
    expect(insertBlock(out, [{ at: "low", h: "then" }], 0, note).find((b) => b.id === "low")).toMatchObject({ then: [note] })
  })

  it("walks the tree in reading order and rebuilds it from the bottom up", async () => {
    const { walk, mapTree, allBlocks, updateBlock, findBlock } = await import("@/modules/builder/data/draft")
    const seen: string[] = []
    walk(tree.line, (b, path) => void seen.push(`${path.map((p) => p.h).join("/")}:${b.id}`))
    expect(seen).toEqual([":bal", ":low", "then:very", "then/then:urgent", "then/then:e1", "then/else:note", "else:time", ":after"])
    // It stops at the first hit.
    const stops: string[] = []
    expect(walk(tree.line, (b) => (stops.push(b.id), b.id === "very"))).toBe(true)
    expect(stops).toEqual(["bal", "low", "very"])
    expect(allBlocks(mapTree(tree.line, (l) => l.filter((b) => b.kind !== "end"))).map((b) => b.id)).not.toContain("e1")
    // A patch that brings its own ways wins over the rebuilt ones (Swap Yes and No).
    const swapped = updateBlock(tree.line, "low", { then: low.else, else: low.then })
    expect(findBlock(swapped, "low")).toMatchObject({ then: [time], else: low.then })
  })

  it("Autopilot lists the tree: each If with its ways, then what follows", async () => {
    const { jobTree, flatSteps } = await import("@/modules/autopilot/data/steps")
    const t = jobTree(toCanvas(tree), "Omaga")
    expect(t.map((s) => s.id)).toEqual(["start", "bal", "low", "after"])
    const lowStep = t.find((s) => s.id === "low")!
    expect(lowStep.then?.[0].then?.map((s) => s.id)).toEqual(["urgent", "e1"])
    expect(lowStep.else?.map((s) => s.id)).toEqual(["time"])
    expect(flatSteps(t).find((s) => s.id === "e1")?.title).toBe("End")
  })
})

describe("engine issues pinned to their blocks (B1.3)", () => {
  it("finds the block by its id or its index, and drops the id from the words", async () => {
    const { engineIssues } = await import("@/modules/builder/data/issues")
    const ids = ["start", "ask-1", "check-1"]
    expect(
      engineIssues(
        [
          { path: "nodes", message: "node ask-1: prompt is empty" },
          { path: "nodes.2.data", message: "bad op" },
          { message: "node gone-9: unknown" },
          {},
        ],
        ids
      )
    ).toEqual([
      { node: "ask-1", text: "prompt is empty" },
      { node: "check-1", text: "bad op" },
      { node: null, text: "unknown" },
      { node: null, text: "This job contains something that is not allowed." },
    ])
  })
})

describe("places, slots and Test run lights", () => {
  const bal: Block = { id: "bal", kind: "tool", tool: "near_view_account", args: { accountId: "a.testnet" } }
  const check: IfBlock = { id: "check", kind: "if", stepId: "bal", field: "balanceNear", op: "lt", right: "5", then: [{ id: "note", kind: "agent", prompt: "Low" }], else: [] }

  it("builds and reads a way's slot id, and where it adds", async () => {
    const { parseSlot, slotId, slotPlace, placeKey, takesMore } = await import("@/modules/builder/data/places")
    expect(parseSlot(slotId("check", "then"))).toEqual({ ifId: "check", h: "then" })
    expect(parseSlot("start")).toBeNull()
    expect(parseSlot(null)).toBeNull()
    expect(slotPlace([bal, check], check, "then")).toEqual({ path: [{ at: "check", h: "then" }], index: 1 })
    expect(placeKey({ path: [{ at: "check", h: "else" }], index: 0 })).toBe("check:else#0")
    expect(takesMore([bal])).toBe(true)
    expect(takesMore([bal, check])).toBe(false)
  })

  it("starts a new If on the first value it can compare", async () => {
    const { newBlock } = await import("@/modules/builder/data/blocks")
    expect(newBlock("if", [bal], { path: [], index: 1 }, { name: "Omaga", address: "" }, "")).toMatchObject({ kind: "if", stepId: "bal", field: "balanceNear", op: "lt" })
    expect(newBlock("tool", [], { path: [], index: 0 }, { name: "Omaga", address: "o.testnet" }, "o.testnet")).toMatchObject({ kind: "tool", args: { accountId: "o.testnet" } })
  })

  it("lights an If from the way that ran, or from carrying on after a run that went well", async () => {
    const { withIf, finishedWell } = await import("@/modules/builder/data/testRun")
    expect(withIf({ bal: { status: "ok" }, note: { status: "ok" } }, [bal, check], false).check).toEqual({ status: "ok", note: "Yes" })
    expect(withIf({ bal: { status: "ok" } }, [bal, check], true).check).toEqual({ status: "ok", note: "Carried on" })
    expect(withIf({ bal: { status: "ok" } }, [bal, check], false).check).toBeUndefined()
    expect(finishedWell({ running: false, nodes: {}, status: "ok", failed: false })).toBe(true)
    expect(finishedWell({ running: false, nodes: {}, status: "failed", failed: false })).toBe(false)
    expect(finishedWell(null)).toBe(false)
  })
})

describe("ways that carry on after their If (a job saved through the API, #165)", () => {
  const inner: IfBlock = { id: "low", kind: "if", stepId: "bal", field: "balanceNear", op: "lt", right: "2", then: [], else: [] }
  const outer: IfBlock = { id: "check", kind: "if", stepId: "bal", field: "balanceNear", op: "lt", right: "10", then: [inner], else: [] }
  const bal: Block = { id: "bal", kind: "tool", tool: "near_view_account", args: { accountId: "a.testnet" } }
  const note: Block = { id: "note", kind: "agent", prompt: "Write a note" }

  it("says a way stops when nothing follows any If around it (the Builder's own jobs)", () => {
    const line = [bal, outer]
    expect(carriesOn(line, [{ at: "check", h: "else" }])).toBe(false)
    expect(carriesOn(line, [{ at: "check", h: "then" }, { at: "low", h: "then" }])).toBe(false)
  })

  it("says a way goes on when steps follow its If, or an If around it", () => {
    const line = [bal, outer, note]
    expect(carriesOn(line, [{ at: "check", h: "else" }])).toBe(true)
    expect(carriesOn(line, [{ at: "check", h: "then" }, { at: "low", h: "else" }])).toBe(true)
    expect(carriesOn(line, [])).toBe(false)
  })
})
