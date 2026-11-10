// A small force layout for the Mind Graph, written here instead of a library (Ancung, 10 Nov:
// plain canvas first). Fine for the tens of nodes a Mind has: every pair pushes apart, every link
// pulls like a spring, everything drifts to the centre, and the motion cools down until it rests.

import type { GraphLink, GraphNode, NodeKind } from "@/modules/graph/data/graph"

/** `lw`: the label's width under the bubble, in world units, so labels get room too. */
export type Body = { id: string; x: number; y: number; vx: number; vy: number; r: number; lw: number; pinned: boolean }

/** About how wide a label is at 11.5 px (Geist averages near 6.2 px a character). */
const labelWidth = (label: string) => label.length * 6.2 + 8

export type Sim = { bodies: Map<string, Body>; links: GraphLink[]; alpha: number }

/** Node radius in world units: the Mind largest, skills next, then by how often it was used. */
export function radiusOf(n: Pick<GraphNode, "kind" | "uses">): number {
  if (n.kind === "mind") return 26
  const base: Record<NodeKind, number> = { mind: 26, skill: 11, app: 13, wallet: 12, tool: 7, memory: 9, model: 9, workflow: 9 }
  return base[n.kind] + Math.min(8, Math.sqrt(n.uses) * 2)
}

// Room for the labels too (Ancung, 10 Nov: the first layout was too tight).
const REST: Partial<Record<NodeKind, number>> = { skill: 150, app: 85, wallet: 85, tool: 75, workflow: 120 }

/** Keeps the bodies of nodes still there (so the graph doesn't jump), places new ones near their parent. */
export function syncSim(prev: Sim | null, nodes: GraphNode[], links: GraphLink[], mindId: string): Sim {
  const bodies = new Map<string, Body>()
  const parent = new Map(links.map((l) => [l.target, l.source]))
  let added = 0
  nodes.forEach((n, i) => {
    const old = prev?.bodies.get(n.id)
    if (old) {
      bodies.set(n.id, { ...old, r: radiusOf(n), lw: labelWidth(n.label) })
      return
    }
    added += 1
    const p = bodies.get(parent.get(n.id) ?? "") ?? prev?.bodies.get(parent.get(n.id) ?? "")
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 + i * 0.7
    const d = n.id === mindId ? 0 : p ? 40 : 140
    bodies.set(n.id, {
      id: n.id,
      x: (p?.x ?? 0) + Math.cos(a) * d,
      y: (p?.y ?? 0) + Math.sin(a) * d,
      vx: 0,
      vy: 0,
      r: radiusOf(n),
      lw: labelWidth(n.label),
      pinned: n.id === mindId,
    })
  })
  return { bodies, links, alpha: added ? 1 : Math.max(prev?.alpha ?? 0, 0.3) }
}

/** One tick. Returns false once it has cooled down and nothing needs drawing for the layout. */
export function stepSim(sim: Sim, kinds: Map<string, NodeKind>): boolean {
  if (sim.alpha < 0.004) return false
  const list = [...sim.bodies.values()]
  const a = sim.alpha
  // Every pair pushes apart, more when close.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const p = list[i]
      const q = list[j]
      let dx = q.x - p.x
      let dy = q.y - p.y
      let d2 = dx * dx + dy * dy
      if (d2 < 0.01) {
        dx = Math.random() - 0.5
        dy = Math.random() - 0.5
        d2 = dx * dx + dy * dy
      }
      const d = Math.sqrt(d2)
      // Labels sit under the bubbles, so keep more room than the bubbles need.
      const min = p.r + q.r + 46
      const f = ((5200 / d2) + (d < min ? (min - d) * 0.6 : 0)) * a
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      p.vx -= fx
      p.vy -= fy
      q.vx += fx
      q.vy += fy
    }
  }
  // Links pull to their rest length.
  for (const l of sim.links) {
    const s = sim.bodies.get(l.source)
    const t = sim.bodies.get(l.target)
    if (!s || !t) continue
    const dx = t.x - s.x
    const dy = t.y - s.y
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    const rest = (REST[kinds.get(l.target) ?? "tool"] ?? 70) + s.r + t.r
    const f = (d - rest) * 0.04 * a
    const fx = (dx / d) * f
    const fy = (dy / d) * f
    s.vx += fx
    s.vy += fy
    t.vx -= fx
    t.vy -= fy
  }
  for (const b of list) {
    if (b.pinned) {
      b.vx = 0
      b.vy = 0
      continue
    }
    // A pull to the centre, and friction.
    b.vx -= b.x * 0.0025 * a
    b.vy -= b.y * 0.0025 * a
    b.vx *= 0.82
    b.vy *= 0.82
    b.x += b.vx
    b.y += b.vy
  }
  // Each bubble with its label is a box; boxes that overlap are pushed apart along the shorter
  // overlap (Ancung, 10 Nov: "NEAR account lookup" sat on the wallet).
  const push = Math.min(1, a * 6) * 0.5
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const p = list[i]
      const q = list[j]
      const hwp = Math.max(p.r, p.lw / 2) + 6
      const hwq = Math.max(q.r, q.lw / 2) + 6
      // The box runs from the top of the bubble to under its label.
      const cyp = p.y + 8
      const cyq = q.y + 8
      const hh = (b: Body) => b.r + 12
      const ox = hwp + hwq - Math.abs(q.x - p.x)
      const oy = hh(p) + hh(q) - Math.abs(cyq - cyp)
      if (ox <= 0 || oy <= 0) continue
      const sx = q.x >= p.x ? 1 : -1
      const sy = cyq >= cyp ? 1 : -1
      const mx = ox < oy ? (ox / 2) * push * sx : 0
      const my = ox < oy ? 0 : (oy / 2) * push * sy
      if (!p.pinned) {
        p.x -= mx
        p.y -= my
      }
      if (!q.pinned) {
        q.x += mx
        q.y += my
      }
    }
  }
  // Bubbles keep off lines that aren't theirs, so a line never runs through a bubble.
  for (const l of sim.links) {
    const s0 = sim.bodies.get(l.source)
    const t0 = sim.bodies.get(l.target)
    if (!s0 || !t0) continue
    const ex = t0.x - s0.x
    const ey = t0.y - s0.y
    const len2 = ex * ex + ey * ey || 1
    for (const b of list) {
      if (b.pinned || b.id === l.source || b.id === l.target) continue
      const t = Math.max(0, Math.min(1, ((b.x - s0.x) * ex + (b.y - s0.y) * ey) / len2))
      const px = s0.x + ex * t
      const py = s0.y + ey * t
      let dx = b.x - px
      let dy = b.y - py
      let d = Math.hypot(dx, dy)
      const room = b.r + 14
      if (d >= room) continue
      if (d < 0.01) {
        dx = -ey
        dy = ex
        d = Math.hypot(dx, dy) || 1
      }
      const f = (room - d) * push
      b.x += (dx / d) * f
      b.y += (dy / d) * f
    }
  }
  sim.alpha *= 0.985
  return true
}
