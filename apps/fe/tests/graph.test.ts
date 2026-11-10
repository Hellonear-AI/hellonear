import { describe, expect, it } from "vitest"
import type { RunEvent } from "@/modules/runs/data/events"
import { buildGraph, callsOf, liveStates, nodeIdFor } from "@/modules/graph/data/graph"
import { stepSim, syncSim } from "@/modules/graph/data/sim"
import type { ApiSkill } from "@/modules/skills/api"

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

  it("leaves no label on another and no bubble on a line, for a Mind as busy as Omaga", () => {
    const busy: ApiSkill[] = [
      ...catalog,
      { skillId: "email-triage", description: "", status: "available", connections: ["gmail"], tools: ["gmail_list_emails", "gmail_read_email", "get_time"] },
      { skillId: "email-address", description: "", status: "available", connections: [], tools: ["mail_send", "mail_list"] },
      { skillId: "near-account", description: "", status: "available", connections: [], tools: ["near_view_account"] },
      { skillId: "http-request", description: "", status: "available", connections: [], tools: ["http_request"] },
    ]
    const g = buildGraph({ mindId: "m1", name: "Omaga", skills: busy.map((b) => b.skillId), catalog: busy, events: [] })
    // A tool shared by several skills hangs off one of them only.
    expect(g.links.filter((l) => l.target === "tool:get_time")).toHaveLength(1)
    const sim = syncSim(null, g.nodes, g.links, "mind:m1")
    const kinds = new Map(g.nodes.map((n) => [n.id, n.kind]))
    for (let t = 0; t < 3000 && stepSim(sim, kinds); t++);
    const bodies = [...sim.bodies.values()]
    let overlaps = 0
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const p = bodies[i]
        const q = bodies[j]
        const ox = Math.max(p.r, p.lw / 2) + Math.max(q.r, q.lw / 2) - Math.abs(q.x - p.x)
        const oy = p.r + q.r + 16 - Math.abs(q.y - p.y)
        if (ox > 4 && oy > 4) overlaps++
      }
    expect(overlaps).toBe(0)
    let onLine = 0
    for (const l of g.links) {
      const a = sim.bodies.get(l.source)!
      const b = sim.bodies.get(l.target)!
      for (const n of bodies) {
        if (n.id === l.source || n.id === l.target) continue
        const ex = b.x - a.x
        const ey = b.y - a.y
        const t = Math.max(0, Math.min(1, ((n.x - a.x) * ex + (n.y - a.y) * ey) / (ex * ex + ey * ey || 1)))
        if (Math.hypot(n.x - (a.x + ex * t), n.y - (a.y + ey * t)) < n.r) onLine++
      }
    }
    expect(onLine).toBe(0)
  })

  it("lists a picked node's latest calls with what went in and came back", () => {
    const events = [
      ev("tool.called", { tool: "get_balance", toolCallId: "a", nodeId: "wallet:m1", args: {} }),
      ev("tool.result", { toolCallId: "a", status: "ok", result: { balanceNear: "5.39" } }),
      ev("tool.called", { tool: "send_payment", toolCallId: "b", nodeId: "wallet:m1", args: { to: "x.testnet", amountNear: "9" } }),
      ev("tool.error", { toolCallId: "b", status: "policy_denied", result: { status: "policy_denied" } }),
      ev("tool.called", { tool: "get_time", toolCallId: "c" }),
    ]
    const calls = callsOf(new Set(["wallet:m1"]), events, "m1")
    expect(calls.map((c) => [c.toolCallId, c.status])).toEqual([
      ["b", "policy_denied"],
      ["a", "ok"],
    ])
    expect(calls[1].result).toEqual({ balanceNear: "5.39" })
  })
})

describe("live view camera", () => {
  it("keeps the point under the pointer still while zooming, and frames a box", async () => {
    const { toWorld, zoomAround, framing, clampZoom } = await import("@/modules/graph/data/camera")
    const size = { w: 400, h: 300 }
    const view = { x: 10, y: -20, k: 1 }
    const p = { x: 120, y: 80 }
    const next = zoomAround(view, size, p, p, 2)
    const a = toWorld(view, size, p)
    const b = toWorld(next, size, p)
    expect(b.x).toBeCloseTo(a.x)
    expect(b.y).toBeCloseTo(a.y)
    expect(clampZoom(9)).toBe(2.5)
    expect(clampZoom(0.1)).toBe(0.35)
    const f = framing({ x0: -100, y0: -50, x1: 100, y1: 50 }, size)
    expect(f.k).toBeCloseTo(Math.min(1.4, 352 / 200, 252 / 100))
    expect(f.x).toBeCloseTo(0)
  })
})

describe("live view layout across chats (Ancung, 11 Nov)", () => {
  it("puts a bubble that comes back where it was, without warming up, and settles a first graph", async () => {
    const { syncSim, settle, stepSim } = await import("@/modules/graph/data/sim")
    const node = (id: string, kind: "mind" | "skill" | "tool") => ({ id, kind, label: id, uses: 0 }) as never
    const nodes = [node("mind:m", "mind"), node("skill:a", "skill"), node("tool:x", "tool")]
    const links = [{ source: "mind:m", target: "skill:a" }, { source: "skill:a", target: "tool:x" }] as never
    const kinds = new Map([["mind:m", "mind"], ["skill:a", "skill"], ["tool:x", "tool"]] as const)
    const first = syncSim(null, nodes, links, "mind:m")
    settle(first, kinds as never)
    expect(stepSim(first, kinds as never)).toBe(false)
    const place = { ...first.bodies.get("tool:x")! }
    // The chat page mounts with the tool missing for a moment, then it comes back.
    const without = syncSim(first, nodes.slice(0, 2), links, "mind:m")
    const back = syncSim(without, nodes, links, "mind:m")
    expect(back.bodies.get("tool:x")).toMatchObject({ x: place.x, y: place.y })
    expect(back.alpha).toBe(first.alpha)
  })
})
