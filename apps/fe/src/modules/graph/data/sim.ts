// A small force layout for the Mind Graph, written here instead of a library (Ancung, 10 Nov:
// plain canvas first). Fine for the tens of nodes a Mind has: every pair pushes apart, every link
// pulls like a spring, everything drifts to the centre, and the motion cools down until it rests.

import type { GraphLink, GraphNode, NodeKind } from "@/modules/graph/data/graph"

export type Body = { id: string; x: number; y: number; vx: number; vy: number; r: number; pinned: boolean }

export type Sim = { bodies: Map<string, Body>; links: GraphLink[]; alpha: number }

/** Node radius in world units: the Mind largest, skills next, then by how often it was used. */
export function radiusOf(n: Pick<GraphNode, "kind" | "uses">): number {
  if (n.kind === "mind") return 26
  const base: Record<NodeKind, number> = { mind: 26, skill: 11, app: 13, wallet: 12, tool: 7, memory: 9, model: 9, workflow: 9 }
  return base[n.kind] + Math.min(8, Math.sqrt(n.uses) * 2)
}

const REST: Partial<Record<NodeKind, number>> = { skill: 110, app: 70, wallet: 70, tool: 60 }

/** Keeps the bodies of nodes still there (so the graph doesn't jump), places new ones near their parent. */
export function syncSim(prev: Sim | null, nodes: GraphNode[], links: GraphLink[], mindId: string): Sim {
  const bodies = new Map<string, Body>()
  const parent = new Map(links.map((l) => [l.target, l.source]))
  let added = 0
  nodes.forEach((n, i) => {
    const old = prev?.bodies.get(n.id)
    if (old) {
      bodies.set(n.id, { ...old, r: radiusOf(n) })
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
      const min = p.r + q.r + 14
      const f = ((1600 / d2) + (d < min ? (min - d) * 0.5 : 0)) * a
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
    b.vx -= b.x * 0.004 * a
    b.vy -= b.y * 0.004 * a
    b.vx *= 0.82
    b.vy *= 0.82
    b.x += b.vx
    b.y += b.vy
  }
  sim.alpha *= 0.985
  return true
}
