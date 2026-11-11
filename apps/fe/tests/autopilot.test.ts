import { describe, expect, it } from "vitest"
import { issueText } from "@/modules/autopilot/data/issues"
import { IDEAS } from "@/modules/autopilot/data/ideas"
import { runSummary } from "@/modules/autopilot/data/runs"
import { scheduleText, whenNext, zoneName } from "@/modules/autopilot/data/schedule"

describe("Autopilot schedules in plain words (#21)", () => {
  it("words the common cron shapes and admits the rest", () => {
    expect(scheduleText("0 8 * * *")).toBe("Every day at 08:00")
    expect(scheduleText("30 7 * * 1-5")).toBe("Weekdays at 07:30")
    expect(scheduleText("0 * * * *")).toBe("Every hour")
    expect(scheduleText("0 9 * * 1")).toBe("Every Monday at 09:00")
    expect(scheduleText("*/5 1 2 * *")).toBe("On a custom schedule")
    expect(scheduleText(null)).toBe("No schedule")
    expect(zoneName("Asia/Jakarta")).toBe("Jakarta")
    expect(zoneName("America/New_York")).toBe("New York")
  })

  it("says when the next run is, on this device's clock", () => {
    const now = new Date(2026, 10, 9, 20, 0)
    expect(whenNext(new Date(2026, 10, 10, 8, 0).toISOString(), now)).toBe("tomorrow 08:00")
    expect(whenNext(new Date(2026, 10, 9, 22, 30).toISOString(), now)).toBe("today 22:30")
    expect(whenNext(null, now)).toBeNull()
  })
})

describe("ready jobs and their steps", () => {
  const balance = IDEAS.find((i) => i.workflowId === "morning-balance-check")!
  const canvas = balance.canvas({ timezone: "Asia/Jakarta", address: "83e05486fc84f7150a70fe44bdfc0692c19182cdd72af7721c9a8a2a511e98bd" })

  it("are valid canvases: one trigger, a then edge, no money tools", () => {
    for (const idea of IDEAS) {
      const c = idea.canvas({ timezone: "UTC", address: "x.testnet" })
      expect(c.nodes.filter((n) => n.type === "trigger")).toHaveLength(1)
      expect(c.nodes.some((n) => n.type === "tool" && n.data.tool === "send_payment")).toBe(false)
      expect(JSON.stringify(c)).not.toContain("{{secrets.")
      for (const e of c.edges) expect(c.nodes.some((n) => n.id === e.target)).toBe(true)
    }
    expect(canvas.edges.find((e) => e.source === "low")?.sourceHandle).toBe("then")
  })

})

describe("run lines and refusals", () => {
  const run = (status: string, nodes: object[]) => ({ runId: "r", trigger: "manual" as const, status, startedAt: "", updatedAt: "", nodes: nodes as never })

  it("prefers what the Mind wrote, then what it found, then the error", () => {
    expect(runSummary(run("success", [{ nodeType: "tool", status: "ok", output: { balanceNear: 0.76 } }, { nodeType: "agent", status: "ok", output: { text: "Top it up." } }]), "Omaga")).toBe("Top it up.")
    expect(runSummary(run("success", [{ nodeType: "tool", status: "ok", output: { balanceNear: 42 } }]), "Omaga")).toBe("Balance 42 NEAR, no note needed")
    expect(runSummary(run("failed", [{ nodeType: "tool", status: "error", error: "Error: NEAR RPC: timeout" }]), "Omaga")).toBe("A step failed: NEAR RPC: timeout")
    expect(runSummary(run("running", []), "Omaga")).toBeNull()
  })

  it("explains why a job can't be turned on (P1.4)", () => {
    expect(issueText({ code: "uses_secrets", message: "x" }, "Omaga")).toContain("can't use keys yet")
    expect(issueText({ code: "missing_tools", message: "x", tools: ["near_view_account"] }, "Omaga")).toContain("Skills")
    expect(issueText({ code: "something_new", message: "Engine words." }, "Omaga")).toBe("Engine words.")
  })
})

describe("the way the last run went (Autopilot steps)", () => {
  it("lights an If's way when a step in it ran, and End after a step that ran", async () => {
    const { wayRan, wentThrough } = await import("@/modules/autopilot/components/StepsTimeline")
    const step = (id: string, kind: "tool" | "agent" | "end" | "trigger" = "agent") => ({ id, kind, title: id })
    const inner = { id: "low", kind: "condition" as const, title: "If", then: [step("urgent"), step("e1", "end")], else: [step("calm"), step("e2", "end")] }
    const tree = [step("t", "trigger"), step("bal", "tool"), { id: "check", kind: "condition" as const, title: "If", then: [inner], else: [step("site")] }]
    const ran = new Set(["bal", "urgent"])
    expect(wentThrough(tree, 0, ran)).toBe(true)
    expect(wentThrough(tree, 2, ran)).toBe(true)
    expect(wayRan(tree[2].then, ran)).toBe(true)
    expect(wayRan(tree[2].else, ran)).toBe(false)
    expect(wentThrough(inner.then, 1, ran)).toBe(true)
    expect(wayRan(inner.else, ran)).toBe(false)
    expect(wentThrough(tree, 0, new Set())).toBe(false)
  })
})
