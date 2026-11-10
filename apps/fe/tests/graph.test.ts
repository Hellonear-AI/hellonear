import { describe, expect, it } from "vitest"
import type { RunEvent } from "@/modules/chat/data/events"
import { buildGraph, liveStates, nodeIdFor } from "@/modules/graph/data/graph"
import { stepSim, syncSim } from "@/modules/graph/data/sim"
import type { ApiSkill } from "@/modules/minds/api"

const catalog: ApiSkill[] = [
  { skillId: "payments", description: "", status: "available", connections: ["near-wallet"], tools: ["send_payment", "get_balance", "list_payments"] },
  { skillId: "daily-planner", description: "", status: "available", connections: ["googlecalendar", "googlemeet"], tools: ["get_time", "googlecalendar_list_events", "googlecalendar_create_meeting"] },
  { skillId: "blocked-one", description: "", status: "blocked", connections: [], tools: ["nope"] },
]

let seq = 0
const ev = (type: string, extra: Partial<RunEvent> = {}): RunEvent => ({ v: 1, type, runId: "r1", mindId: "m1", seq: ++seq, ts: `2026-11-10T10:00:${String(seq).padStart(2, "0")}Z`, ...extra })

describe("Mind Graph (#17)", () => {
  it("names nodes like the engine (docs/api-contract.md §4)", () => {
    expect(nodeIdFor("m1", "send_payment")).toBe("wallet:m1")
    expect(nodeIdFor("m1", "gmail_list_emails")).toBe("app:gmail")
    expect(nodeIdFor("m1", "mail_send")).toBe("app:mail")
    expect(nodeIdFor("m1", "skill_read", { skillName: "payments" })).toBe("skill:payments")
    expect(nodeIdFor("m1", "near_view_account")).toBe("tool:near_view_account")
  })

  it("puts the Mind, its skills and what they reach on the graph, never blocked skills", () => {
    const g = buildGraph({ mindId: "m1", name: "Omaga", skills: ["payments", "daily-planner", "blocked-one"], catalog, events: [] })
    const ids = g.nodes.map((n) => n.id)
    expect(ids).toEqual(expect.arrayContaining(["mind:m1", "skill:payments", "wallet:m1", "skill:daily-planner", "app:googlecalendar", "app:googlemeet", "tool:get_time"]))
    expect(ids).not.toContain("skill:blocked-one")
    expect(g.links).toContainEqual({ source: "skill:payments", target: "wallet:m1" })
    expect(g.nodes.find((n) => n.id === "app:googlecalendar")).toMatchObject({ kind: "app", app: "googlecalendar", label: "Google Calendar" })
  })

  it("counts calls and keeps each node's last state", () => {
    const events = [
      ev("tool.called", { tool: "get_balance", toolCallId: "a", nodeId: "wallet:m1" }),
      ev("tool.result", { toolCallId: "a", status: "ok" }),
      ev("tool.called", { tool: "send_payment", toolCallId: "b", nodeId: "wallet:m1" }),
      ev("tool.approval_required", { toolCallId: "b" }),
      ev("tool.called", { tool: "googlecalendar_create_meeting", toolCallId: "c", args: { meet: true } }),
    ]
    const g = buildGraph({ mindId: "m1", name: "Omaga", skills: ["payments", "daily-planner"], catalog, events })
    expect(g.nodes.find((n) => n.id === "wallet:m1")).toMatchObject({ uses: 2, state: "waiting" })
    expect(g.nodes.find((n) => n.id === "app:googlecalendar")).toMatchObject({ uses: 1, state: "running" })
    // A meeting with a Meet link lights Google Meet too.
    expect(g.nodes.find((n) => n.id === "app:googlemeet")).toMatchObject({ uses: 1, state: "running" })
  })

  it("shows a refused payment as blocked, and a tool from no skill hangs off the Mind", () => {
    const events = [
      ev("tool.called", { tool: "send_payment", toolCallId: "p", nodeId: "wallet:m1" }),
      ev("tool.error", { toolCallId: "p", status: "policy_denied" }),
      ev("tool.called", { tool: "http_request", toolCallId: "h" }),
    ]
    const g = buildGraph({ mindId: "m1", name: "Omaga", skills: ["payments"], catalog, events })
    expect(g.nodes.find((n) => n.id === "wallet:m1")?.state).toBe("denied")
    expect(g.links).toContainEqual({ source: "mind:m1", target: "tool:http_request" })
  })

  it("settles the layout without losing a node or making NaN", () => {
    const g = buildGraph({ mindId: "m1", name: "Omaga", skills: ["payments", "daily-planner"], catalog, events: [] })
    const sim = syncSim(null, g.nodes, g.links, "mind:m1")
    const kinds = new Map(g.nodes.map((n) => [n.id, n.kind]))
    let ticks = 0
    while (stepSim(sim, kinds) && ticks < 2000) ticks++
    expect(ticks).toBeLessThan(2000)
    const bodies = [...sim.bodies.values()]
    expect(bodies).toHaveLength(g.nodes.length)
    expect(bodies.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y))).toBe(true)
    expect(sim.bodies.get("mind:m1")).toMatchObject({ x: 0, y: 0 })
  })

  it("keeps only states that mean something now", () => {
    const events = [
      ev("tool.called", { tool: "send_payment", toolCallId: "old", nodeId: "wallet:m1", runId: "r0" }),
      ev("tool.approval_required", { toolCallId: "old", runId: "r0" }),
      ev("tool.called", { tool: "get_time", toolCallId: "t", runId: "r9" }),
      ev("tool.called", { tool: "updateWorkingMemory", toolCallId: "m", nodeId: "tool:updateWorkingMemory", runId: "r9" }),
    ]
    const g = buildGraph({ mindId: "m1", name: "Omaga", skills: ["payments", "daily-planner"], catalog, events })
    expect(g.nodes.find((n) => n.id === "memory:m1")).toMatchObject({ kind: "memory", label: "Memory" })
    // Nothing streaming, the approval no longer open: no pulse from history.
    const idle = liveStates(g.nodes, null, new Set())
    expect(idle.find((n) => n.id === "wallet:m1")?.state).toBeUndefined()
    expect(idle.find((n) => n.id === "tool:get_time")?.state).toBeUndefined()
    // The run on screen and an approval still open keep theirs.
    const now = liveStates(g.nodes, "r9", new Set(["old"]))
    expect(now.find((n) => n.id === "tool:get_time")?.state).toBe("running")
    expect(now.find((n) => n.id === "wallet:m1")?.state).toBe("waiting")
  })
})
