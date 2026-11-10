"use client"

import { useEffect, useRef } from "react"
import { cn } from "cn"
import { GmailLogo, GoogleCalendarLogo, GoogleMeetLogo } from "@/components/elements/AppLogos"
import type { GraphLink, GraphNode, NodeKind } from "@/modules/graph/data/graph"
import { stepSim, syncSim, type Sim } from "@/modules/graph/data/sim"

// The Mind Graph drawn on a plain canvas (Ancung, 10 Nov: Obsidian-like, no library): bubbles that
// settle with a small force layout, lines that carry moving dots while a tool runs, rings that
// pulse with the result, the apps' own logos, a lime torch on the lines under the mouse, drag to
// move a bubble, drag the background to pan, and the wheel to zoom. Hover dims nothing (Ancung,
// 10 Nov: dimming the rest felt odd); the hovered label turns bold.

type Props = {
  mindId: string
  nodes: GraphNode[]
  links: GraphLink[]
  avatarSrc: string
  selected: string | null
  onSelect: (id: string | null) => void
  label: string
  /** Nodes the reply on screen (or the last one) used: their paths from the Mind stay lit. */
  trail?: string[]
  /** The reply is still streaming: the trail carries moving dots. */
  live?: boolean
  /** The run on screen. Only its changes pulse; history loading in never does. */
  run?: string | null
  className?: string
}

type Colors = Record<
  "fg" | "muted" | "faint" | "line" | "glow" | "surface" | "bg" | "info" | "success" | "danger" | "warning" | "mind" | "skill" | "tool" | "app" | "wallet" | "memory" | "model",
  string
>

const VAR: Record<keyof Colors, string> = {
  fg: "--foreground",
  muted: "--muted-foreground",
  faint: "--tertiary-foreground",
  line: "--border-strong",
  // The one accent (lime in dark mode, its deep olive in light), for the hover glow.
  glow: "--focus",
  surface: "--surface",
  bg: "--background",
  info: "--info",
  success: "--success",
  danger: "--danger",
  warning: "--warning",
  mind: "--node-mind",
  skill: "--node-skill",
  tool: "--node-tool",
  app: "--node-app",
  wallet: "--node-wallet",
  memory: "--node-memory",
  model: "--node-model",
}

function readColors(): Colors {
  const css = getComputedStyle(document.documentElement)
  return Object.fromEntries(Object.entries(VAR).map(([k, v]) => [k, css.getPropertyValue(v).trim() || "#888"])) as Colors
}

const FILL: Record<NodeKind, keyof Colors> = { mind: "mind", skill: "skill", tool: "tool", app: "surface", wallet: "wallet", memory: "memory", model: "model", workflow: "model" }

/** How long a finished state keeps glowing (ms). */
const AFTERGLOW = { ok: 1600, error: 4000, denied: 4000 } as const

export function MindGraph({ mindId, nodes, links, avatarSrc, selected, onSelect, label, trail = [], live = false, run = null, className }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const logos = useRef<HTMLDivElement>(null)
  const sim = useRef<Sim | null>(null)
  const data = useRef({ nodes, links, selected, trail, live })
  // When this page saw each node's state change (performance clock). Pulses are timed from here,
  // not from the event's own time, which comes from the server's clock and can arrive late
  // (Ancung, 10 Nov: a 1 s calendar call never lit up).
  const seen = useRef(new Map<string, { key: string; at: number }>())
  const view = useRef({ x: 0, y: 0, k: 1, auto: true })
  // The node the camera is gliding to after a click (Axel, via Ancung, 10 Nov: zoom to it).
  const focus = useRef<string | null>(null)
  const lastSelected = useRef<string | null>(null)
  const hover = useRef<string | null>(null)
  // Where the cursor is, in graph space, for the torch on the lines.
  const torch = useRef<{ x: number; y: number } | null>(null)
  const images = useRef(new Map<string, HTMLImageElement>())
  const select = useRef(onSelect)
  useEffect(() => {
    select.current = onSelect
  }, [onSelect])
  const mind = `mind:${mindId}`

  // New data: keep the bodies that stay, warm the layout up a little.
  useEffect(() => {
    data.current = { nodes, links, selected, trail, live }
    if (selected && selected !== lastSelected.current) {
      focus.current = selected
      view.current.auto = false
    }
    lastSelected.current = selected
    sim.current = syncSim(sim.current, nodes, links, mind)
    const now = performance.now()
    for (const n of nodes) {
      const key = `${n.state ?? ""}:${n.at ?? ""}`
      const old = seen.current.get(n.id)
      // Only the run on screen pulses. History arriving after the first draw also changes states,
      // and lit up the whole graph on open (Ancung, 10 Nov).
      const mine = Boolean(run && n.run === run)
      if (!old || old.key !== key) seen.current.set(n.id, { key, at: mine ? now : -Infinity })
    }
  }, [nodes, links, selected, trail, live, run, mind])

  // The avatar and the apps' logos as images the canvas can draw.
  useEffect(() => {
    const load = (key: string, src: string) => {
      const img = new Image()
      img.src = src
      images.current.set(key, img)
    }
    load("avatar", avatarSrc)
    const box = logos.current
    if (!box) return
    for (const wrapEl of box.querySelectorAll<HTMLElement>("[data-wrap]")) {
      const el = wrapEl.querySelector("svg")
      if (!el) continue
      const svg = el.cloneNode(true) as SVGSVGElement
      svg.setAttribute("width", "64")
      svg.setAttribute("height", "64")
      load(`app:${wrapEl.dataset.wrap}`, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`)
    }
  }, [avatarSrc])

  useEffect(() => {
    const cv = canvas.current
    const box = wrap.current
    if (!cv || !box) return
    const ctx = cv.getContext("2d")
    if (!ctx) return
    let colors = readColors()
    let font = getComputedStyle(document.body).fontFamily
    const still = window.matchMedia("(prefers-reduced-motion: reduce)")
    let size = { w: 0, h: 0, dpr: 1 }
    let frame = 0
    let visible = true

    const resize = () => {
      const r = box.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      size = { w: r.width, h: r.height, dpr }
      cv.width = Math.round(r.width * dpr)
      cv.height = Math.round(r.height * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(box)
    // Theme changes swap the class on <html>.
    const mo = new MutationObserver(() => {
      colors = readColors()
      font = getComputedStyle(document.body).fontFamily
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] })
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(box)

    const toWorld = (px: number, py: number) => {
      const v = view.current
      return { x: (px - size.w / 2 - v.x) / v.k, y: (py - size.h / 2 - v.y) / v.k }
    }
    const hit = (px: number, py: number) => {
      const p = toWorld(px, py)
      let best: string | null = null
      let bestD = Infinity
      for (const b of sim.current?.bodies.values() ?? []) {
        const d = Math.hypot(b.x - p.x, b.y - p.y)
        if (d < b.r + 6 / view.current.k && d < bestD) {
          best = b.id
          bestD = d
        }
      }
      return best
    }

    // Fit the layout in the box until the user moves the view themselves.
    const fit = () => {
      const bodies = [...(sim.current?.bodies.values() ?? [])]
      if (!bodies.length || !size.w) return
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const b of bodies) {
        x0 = Math.min(x0, b.x - b.r)
        y0 = Math.min(y0, b.y - b.r)
        x1 = Math.max(x1, b.x + b.r)
        y1 = Math.max(y1, b.y + b.r + 16)
      }
      const k = Math.min(1.4, Math.max(0.35, Math.min((size.w - 48) / (x1 - x0 || 1), (size.h - 48) / (y1 - y0 || 1))))
      const v = view.current
      const tx = -((x0 + x1) / 2) * k
      const ty = -((y0 + y1) / 2) * k
      v.k += (k - v.k) * 0.12
      v.x += (tx - v.x) * 0.12
      v.y += (ty - v.y) * 0.12
    }

    // The chain of links from the Mind to a node, for the moving dots.
    const pathTo = (id: string) => {
      const parent = new Map(data.current.links.map((l) => [l.target, l.source]))
      const out: string[] = [id]
      let at = id
      for (let i = 0; i < 6 && at !== mind; i++) {
        const p = parent.get(at)
        if (!p) break
        out.unshift(p)
        at = p
      }
      return out
    }

    const draw = (now: number) => {
      const s = sim.current
      if (!s) return
      const kinds = new Map(data.current.nodes.map((n) => [n.id, n.kind]))
      const moving = stepSim(s, kinds)
      if (view.current.auto && (moving || now < 1500)) fit()
      // Glide to the picked node and zoom in a little; a jump with reduced motion.
      const f = focus.current ? s.bodies.get(focus.current) : null
      if (f) {
        const v0 = view.current
        const k = Math.max(v0.k, 1.6)
        const tx = -f.x * k
        const ty = -f.y * k
        const e = still.matches ? 1 : 0.14
        v0.k += (k - v0.k) * e
        v0.x += (tx - v0.x) * e
        v0.y += (ty - v0.y) * e
        if (Math.abs(tx - v0.x) < 0.5 && Math.abs(ty - v0.y) < 0.5 && Math.abs(k - v0.k) < 0.005) focus.current = null
      }
      const { w, h, dpr } = size
      const v = view.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * (w / 2 + v.x), dpr * (h / 2 + v.y))

      const byId = new Map(data.current.nodes.map((n) => [n.id, n]))
      const sinceSeen = (n: GraphNode) => now - (seen.current.get(n.id)?.at ?? -Infinity)
      const glowing = (n: GraphNode) =>
        n.state === "running" || n.state === "waiting" || (n.state !== undefined && sinceSeen(n) < AFTERGLOW[n.state])
      // The links on the way from the Mind to every node this reply used.
      const trailLinks = new Set<string>()
      for (const id of data.current.trail) {
        const path = pathTo(id)
        for (let i = 0; i < path.length - 1; i++) trailLinks.add(`${path[i]}>${path[i + 1]}`)
      }
      const onTrail = new Set(data.current.trail)
      const stateColor = (n: GraphNode) =>
        n.state === "running" ? colors.info : n.state === "waiting" ? colors.warning : n.state === "ok" ? colors.success : colors.danger

      // Lines.
      for (const l of data.current.links) {
        const a = s.bodies.get(l.source)
        const b = s.bodies.get(l.target)
        const t = byId.get(l.target)
        if (!a || !b || !t) continue
        const on = glowing(t)
        const path = trailLinks.has(`${l.source}>${l.target}`)
        ctx.globalAlpha = on ? 0.95 : path ? (data.current.live ? 0.9 : 0.55) : 0.5
        ctx.strokeStyle = on ? stateColor(t) : path ? colors.info : colors.line
        ctx.lineWidth = (on || path ? 2.2 : 1.1) / v.k
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      // A torch under the cursor (Ancung, 10 Nov): the parts of the lines near it catch a lime
      // light that fades out with distance, as if the pointer shone on them.
      const tp = torch.current
      if (tp) {
        const reach = 90 / v.k
        const g = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, reach)
        g.addColorStop(0, colors.glow)
        // Fade to the same lime at zero alpha, not "transparent" (black), so no grey band shows.
        g.addColorStop(1, /^#[0-9a-f]{6}$/i.test(colors.glow) ? `${colors.glow}00` : "transparent")
        ctx.save()
        ctx.strokeStyle = g
        ctx.lineWidth = 2.4 / v.k
        ctx.shadowColor = colors.glow
        ctx.shadowBlur = 8 * dpr
        ctx.globalAlpha = 1
        ctx.beginPath()
        for (const l of data.current.links) {
          const a = s.bodies.get(l.source)
          const b = s.bodies.get(l.target)
          if (!a || !b) continue
          // Only lines that pass within reach of the cursor.
          const ex = b.x - a.x
          const ey = b.y - a.y
          const t = Math.max(0, Math.min(1, ((tp.x - a.x) * ex + (tp.y - a.y) * ey) / (ex * ex + ey * ey || 1)))
          if (Math.hypot(tp.x - (a.x + ex * t), tp.y - (a.y + ey * t)) > reach) continue
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
        }
        ctx.stroke()
        ctx.restore()
      }

      // While the reply streams, slow dots keep flowing along its whole trail.
      if (!still.matches && data.current.live) {
        ctx.fillStyle = colors.info
        for (const id of data.current.trail) {
          const n = byId.get(id)
          if (!n || n.state === "running" || n.state === "waiting") continue
          const path = pathTo(id)
          for (let i = 0; i < path.length - 1; i++) {
            const a = s.bodies.get(path[i])
            const b = s.bodies.get(path[i + 1])
            if (!a || !b) continue
            for (let j = 0; j < 2; j++) {
              const p = (now / 1600 + j / 2 + i * 0.23) % 1
              ctx.globalAlpha = 0.7 * Math.sin(p * Math.PI)
              ctx.beginPath()
              ctx.arc(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, 2 / v.k, 0, Math.PI * 2)
              ctx.fill()
            }
          }
        }
      }

      // Dots travelling from the Mind to a tool that is working (or waiting on the owner).
      if (!still.matches) {
        for (const n of data.current.nodes) {
          if (n.state !== "running" && n.state !== "waiting") continue
          const path = pathTo(n.id)
          ctx.fillStyle = stateColor(n)
          for (let i = 0; i < path.length - 1; i++) {
            const a = s.bodies.get(path[i])
            const b = s.bodies.get(path[i + 1])
            if (!a || !b) continue
            for (let j = 0; j < 3; j++) {
              const p = ((now / (n.state === "waiting" ? 1800 : 900)) + j / 3 + i * 0.17) % 1
              ctx.globalAlpha = Math.sin(p * Math.PI)
              ctx.beginPath()
              ctx.arc(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, 2.4 / v.k, 0, Math.PI * 2)
              ctx.fill()
            }
          }
        }
      }

      // Bubbles.
      for (const n of data.current.nodes) {
        const b = s.bodies.get(n.id)
        if (!b) continue
        const dim = false
        ctx.globalAlpha = dim ? 0.22 : 1

        if (glowing(n)) {
          const c = stateColor(n)
          const since = sinceSeen(n)
          const loop = n.state === "running" ? (now % 1200) / 1200 : n.state === "waiting" ? 0.5 + 0.5 * Math.sin(now / 400) : Math.min(1, since / 900)
          // A soft halo, then a ring that grows and fades.
          ctx.fillStyle = c
          ctx.globalAlpha = (dim ? 0.1 : 0.18) * (n.state === "running" || n.state === "waiting" ? 1 : 1 - loop)
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.r + 9, 0, Math.PI * 2)
          ctx.fill()
          if (!still.matches) {
            ctx.strokeStyle = c
            ctx.lineWidth = 2 / v.k
            ctx.globalAlpha = (dim ? 0.2 : 0.8) * (1 - loop)
            ctx.beginPath()
            ctx.arc(b.x, b.y, b.r + 3 + loop * 16, 0, Math.PI * 2)
            ctx.stroke()
          }
          ctx.globalAlpha = dim ? 0.22 : 1
        }

        if (n.kind === "mind") {
          const img = images.current.get("avatar")
          ctx.save()
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
          ctx.fillStyle = colors.surface
          ctx.fill()
          ctx.clip()
          if (img?.complete && img.naturalWidth) ctx.drawImage(img, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2)
          ctx.restore()
          ctx.strokeStyle = colors.fg
          ctx.lineWidth = 2 / v.k
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          ctx.fillStyle = colors[FILL[n.kind]]
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
          ctx.fill()
          if (n.kind === "app") {
            ctx.strokeStyle = colors.line
            ctx.lineWidth = 1 / v.k
            ctx.stroke()
            const img = images.current.get(`app:${n.app}`)
            const s2 = b.r * 1.15
            if (img?.complete && img.naturalWidth) ctx.drawImage(img, b.x - s2 / 2, b.y - s2 / 2, s2, s2)
            else if (n.app === "mail") {
              ctx.fillStyle = colors.app
              ctx.beginPath()
              ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2)
              ctx.fill()
            }
          }
        }

        if (onTrail.has(n.id) && n.kind !== "mind" && !glowing(n)) {
          ctx.strokeStyle = colors.info
          ctx.lineWidth = 1.6 / v.k
          ctx.globalAlpha = dim ? 0.15 : data.current.live ? 0.9 : 0.55
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.r + 3.5 / v.k, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = dim ? 0.22 : 1
        }

        if (n.id === data.current.selected) {
          ctx.strokeStyle = colors.fg
          ctx.lineWidth = 2 / v.k
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2)
          ctx.stroke()
        }

        ctx.globalAlpha = 1
      }

      // Labels last, over every bubble and line, each with an outline in the panel's colour so it
      // stays readable where lines cross it (Ancung, 10 Nov: Google Meet hid "Omaga"). Tools get
      // a quieter label instead of none, so a blue dot always says what it is.
      ctx.textAlign = "center"
      ctx.textBaseline = "top"
      ctx.lineJoin = "round"
      for (const n of data.current.nodes) {
        const b = s.bodies.get(n.id)
        if (!b) continue
        const dim = false
        const strong = hover.current === n.id || n.id === data.current.selected || glowing(n)
        const px = (n.kind === "mind" ? 13 : n.kind === "tool" ? 10.5 : 11.5) / Math.max(0.8, v.k)
        ctx.font = `${n.kind === "mind" || strong ? 600 : 500} ${px}px ${font}`
        ctx.globalAlpha = dim ? 0.18 : 1
        ctx.strokeStyle = colors.bg
        ctx.lineWidth = 4 / v.k
        const y = b.y + b.r + 5 / v.k
        ctx.strokeText(n.label, b.x, y)
        ctx.fillStyle = strong || n.kind === "mind" ? colors.fg : n.kind === "tool" ? colors.faint : colors.muted
        ctx.fillText(n.label, b.x, y)
      }
      ctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      if (visible && !document.hidden) draw(now)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    // Pointer: drag a bubble, drag the background to pan, click to pick.
    let drag: { id: string | null; x: number; y: number; moved: boolean; vx: number; vy: number } | null = null
    const local = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const down = (e: PointerEvent) => {
      // Dragging on the graph moves the graph, not the drawer it sits in on phones.
      e.stopPropagation()
      const p = local(e)
      const id = hit(p.x, p.y)
      drag = { id, x: p.x, y: p.y, moved: false, vx: view.current.x, vy: view.current.y }
      cv.setPointerCapture(e.pointerId)
      cv.style.cursor = id ? "grabbing" : "grabbing"
    }
    const move = (e: PointerEvent) => {
      const p = local(e)
      if (e.pointerType === "mouse") torch.current = toWorld(p.x, p.y)
      if (!drag) {
        const id = hit(p.x, p.y)
        if (id !== hover.current) hover.current = id
        cv.style.cursor = id ? "pointer" : "grab"
        return
      }
      if (Math.hypot(p.x - drag.x, p.y - drag.y) > 3) drag.moved = true
      if (!drag.moved) return
      const s = sim.current
      if (drag.id && s) {
        const b = s.bodies.get(drag.id)
        if (b) {
          const w = toWorld(p.x, p.y)
          b.x = w.x
          b.y = w.y
          b.vx = 0
          b.vy = 0
          b.pinned = true
          // Keep it warm while dragging, so linked bubbles follow like rubber bands (Obsidian).
          s.alpha = Math.max(s.alpha, 0.6)
        }
      } else {
        view.current.auto = false
        focus.current = null
        view.current.x = drag.vx + (p.x - drag.x)
        view.current.y = drag.vy + (p.y - drag.y)
      }
    }
    const up = () => {
      if (!drag) return
      const s = sim.current
      if (drag.id && s && drag.id !== mind) {
        const b = s.bodies.get(drag.id)
        if (b) b.pinned = false
        // Let go: it springs back into place.
        s.alpha = Math.max(s.alpha, 0.7)
      }
      if (!drag.moved) select.current(drag.id)
      drag = null
      cv.style.cursor = hover.current ? "pointer" : "grab"
    }
    const leave = () => {
      torch.current = null
      if (!drag) hover.current = null
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e)
      const v = view.current
      const k = Math.min(2.5, Math.max(0.35, v.k * Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.003)))
      // Zoom around the pointer.
      const wx = (p.x - size.w / 2 - v.x) / v.k
      const wy = (p.y - size.h / 2 - v.y) / v.k
      v.k = k
      v.x = p.x - size.w / 2 - wx * k
      v.y = p.y - size.h / 2 - wy * k
      v.auto = false
      focus.current = null
    }
    cv.addEventListener("pointerdown", down)
    cv.addEventListener("pointermove", move)
    cv.addEventListener("pointerup", up)
    cv.addEventListener("pointercancel", up)
    cv.addEventListener("pointerleave", leave)
    cv.addEventListener("wheel", wheel, { passive: false })
    cv.style.cursor = "grab"

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      mo.disconnect()
      io.disconnect()
      cv.removeEventListener("pointerdown", down)
      cv.removeEventListener("pointermove", move)
      cv.removeEventListener("pointerup", up)
      cv.removeEventListener("pointercancel", up)
      cv.removeEventListener("pointerleave", leave)
      cv.removeEventListener("wheel", wheel)
    }
  }, [mind])

  return (
    <div ref={wrap} className={cn("relative touch-none overflow-hidden", className)}>
      <canvas ref={canvas} role="img" aria-label={label} className="absolute inset-0 size-full" />
      {/* The apps' own logos (AppLogos), read once into images for the canvas. */}
      <div ref={logos} aria-hidden className="hidden">
        <span data-wrap="gmail">
          <GmailLogo />
        </span>
        <span data-wrap="googlecalendar">
          <GoogleCalendarLogo />
        </span>
        <span data-wrap="googlemeet">
          <GoogleMeetLogo />
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          focus.current = null
          view.current.auto = true
        }}
        className="absolute right-2 bottom-2 rounded-full bg-surface/90 px-2.5 py-1 text-xs text-muted-foreground shadow-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
      >
        Fit
      </button>
    </div>
  )
}
