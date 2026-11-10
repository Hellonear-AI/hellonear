import { describe, expect, it } from "vitest"
import { IDEAS } from "@/modules/autopilot/data/ideas"
import { cronOf, draftProblems, emptyDraft, fromCanvas, moveStepIn, notesBefore, repeatOf, resultsBefore, toCanvas, workflowIdFor, type Draft } from "@/modules/builder/data/draft"

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
    expect(draftProblems(base).map((p) => p.text)).toEqual(["Enter a number in the If block.", "Add a step to If yes or If no."])
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
  const base: Draft = { name: "Watch", repeat: "daily", day: 1, time: "09:00", timezone: "UTC", steps: [tool], branch: null }

  it("saves an empty Yes with a step on No as the opposite check, so either way can stop", async () => {
    const { engineBranch, toCanvas } = await import("@/modules/builder/data/draft")
    const web = { id: "w", kind: "http" as const, method: "POST" as const, url: "https://hooks.example.com/x", key: "", body: "Low" }
    const d: Draft = { ...base, branch: { id: "c", stepId: "t", field: "balanceNear", op: "lt", right: "5", then: null, else: web } }
    expect(engineBranch(d.branch!)).toMatchObject({ op: "gte", then: web, else: null })
    const c = toCanvas(d)
    expect(c.nodes.find((n) => n.type === "condition")).toMatchObject({ data: { op: "gte", right: 5 } })
    expect(c.edges).toContainEqual({ source: "c", target: "w", sourceHandle: "then" })
    expect(draftProblems(d)).toEqual([])
  })

  it("lets a way hold a tool or a website, and opens it again", () => {
    const d: Draft = { ...base, branch: { id: "c", stepId: "t", field: "balanceNear", op: "lt", right: "5", then: { id: "n", kind: "tool", tool: "get_time", args: {} }, else: null } }
    expect(fromCanvas(toCanvas(d), "UTC")?.branch?.then).toEqual({ id: "n", kind: "tool", tool: "get_time", args: {} })
  })

  it("needs a step on at least one way, and only one way may ask the Mind", () => {
    const empty: Draft = { ...base, branch: { id: "c", stepId: "t", field: "balanceNear", op: "lt", right: "5", then: null, else: null } }
    expect(draftProblems(empty).map((p) => p.text)).toEqual(["Add a step to If yes or If no."])
    const both: Draft = { ...base, branch: { ...empty.branch!, then: { id: "a", kind: "agent", prompt: "x" }, else: { id: "b", kind: "agent", prompt: "y" } } }
    expect(draftProblems(both).map((p) => p.where)).toEqual(["b"])
  })

  it("shows earlier results as {Balance} and saves them as references", async () => {
    const { promptFromDisplay, promptToDisplay } = await import("@/modules/builder/data/draft")
    const self = { name: "Omaga", address: "a".repeat(64) }
    const own = { ...tool, args: { accountId: self.address } }
    const other = { ...tool, id: "t2", args: { accountId: "lin1er.testnet" } }
    const results = resultsBefore([own, other], undefined, self)
    expect(results.map((r) => r.source)).toEqual(["Omaga's wallet", "lin1er.testnet"])
    const raw = "Wallet has {{steps.t.balanceNear}} and {{steps.t2.balanceNear}} NEAR {left}"
    const shown = promptToDisplay(raw, results)
    expect(shown).toBe("Wallet has {Balance of Omaga} and {Balance of lin1er.testnet} NEAR {left}")
    expect(promptFromDisplay(shown, results)).toBe(raw)
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
  const job: Draft = {
    ...draft,
    steps: [
      { id: "note", kind: "agent", prompt: "Write my morning brief." },
      { id: "cal", kind: "tool", tool: "googlecalendar_block_time", args: { title: "Focus time", at: "09:00", minutes: "30" } },
      { id: "mail", kind: "tool", tool: "mail_send_to_owner", args: { subject: "Your morning", text: "{{steps.note.text}}" } },
    ],
  }

  it("saves both as tool steps and opens them again", () => {
    const c = toCanvas(job)
    expect(c.nodes.slice(2).map((n) => n.data)).toEqual([
      { tool: "googlecalendar_block_time", args: { title: "Focus time", at: "09:00", minutes: "30" } },
      { tool: "mail_send_to_owner", args: { subject: "Your morning", text: "{{steps.note.text}}" } },
    ])
    expect(fromCanvas(c, "UTC")?.steps).toEqual(job.steps)
  })

  it("Email me offers only the notes earlier Ask steps wrote", () => {
    const steps = [{ id: "bal", kind: "tool" as const, tool: "near_view_account", args: { accountId: "shop.testnet" } }, ...job.steps]
    expect(notesBefore(steps, 3).map((n) => `${n.stepId}.${n.name}`)).toEqual(["note.text"])
    expect(notesBefore(steps, 1)).toEqual([])
  })

  it("needs a name, a time, 5 to 480 minutes, a subject and an email", () => {
    const bad: Draft = { ...job, steps: [{ id: "cal", kind: "tool", tool: "googlecalendar_block_time", args: { title: " ", at: "9", minutes: "2" } }, { id: "mail", kind: "tool", tool: "mail_send_to_owner", args: { subject: "", text: "" } }] }
    expect(draftProblems(bad).map((p) => p.text)).toEqual([
      "Event name is required.",
      "Time is required.",
      "Minutes must be a whole number from 5 to 480.",
      "Subject is required.",
      "Email is required.",
    ])
    expect(draftProblems(job)).toEqual([])
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
