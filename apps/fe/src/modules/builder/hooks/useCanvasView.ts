"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { prefersReducedMotion } from "@/lib/media"

// Pan and zoom for the Builder canvas, the way n8n does it (docs.n8n.io/build/keyboard-shortcuts,
// read 9 Nov): scroll or two fingers move the view, Ctrl/Cmd + scroll (and a trackpad pinch) zooms
// around the pointer, and dragging empty canvas, Space + drag or the middle button moves it.
//
// Smooth (Ancung, 9 Nov: it stuttered and jumped): the view is written straight to the DOM once
// per frame, never through React state, so the Builder doesn't re-render while you move. Wheel and
// buttons ease toward where you're going; dragging follows the pointer 1:1.
//
// Phones and tablets (Ancung, 12 Nov): one finger on empty canvas pans, two fingers pinch to zoom
// around the point between them and move the view with it, anywhere on the canvas, cards included.

export type View = { x: number; y: number; zoom: number }

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2
/** One press of +, - or the zoom buttons. */
export const ZOOM_STEP = 1.2
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
const TOP = 32
/** How fast the view catches up each frame (0..1): high enough to feel direct, low enough to glide. */
const EASE = 0.28
/** Zoom per wheel pixel: one mouse notch (about 100 px) is about 18%; a pinch is gentler. */
const ZOOM_PER_PX = 0.002

/** Where the view goes so the content fits in the frame, centered, never above 100%. */
export function fitView(frame: { w: number; h: number }, content: { w: number; h: number }, pad = 48): View {
  const zoom = clamp(Math.min(1, (frame.w - pad * 2) / content.w, (frame.h - pad * 2) / content.h))
  return { zoom, x: (frame.w - content.w * zoom) / 2, y: Math.max(TOP, (frame.h - content.h * zoom) / 2) }
}

/** Zoom to `next` keeping the point (ax, ay) of the frame still. */
export function zoomAround(v: View, next: number, ax: number, ay: number): View {
  const zoom = clamp(next)
  const k = zoom / v.zoom
  return { zoom, x: ax - (ax - v.x) * k, y: ay - (ay - v.y) * k }
}

/** Wheel deltas in pixels, whatever the device reports (lines on some mice, pages rarely). */
export function wheelPixels(e: { deltaX: number; deltaY: number; deltaMode: number }): { dx: number; dy: number } {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
  return { dx: e.deltaX * unit, dy: e.deltaY * unit }
}

/**
 * How far one wheel event pans. Shift + scroll pans sideways (Ancung, 9 Nov): some browsers
 * already turn it into deltaX, others leave it on deltaY, so either one moves the view across.
 */
export function wheelPan({ dx, dy, shift }: { dx: number; dy: number; shift: boolean }): { x: number; y: number } {
  if (shift) return { x: dx !== 0 ? dx : dy, y: 0 }
  return { x: dx, y: dy }
}

/** Zoom factor for one wheel event: capped so a fast wheel moves one notch at a time. */
export function wheelZoomFactor(dy: number): number {
  return Math.exp(-Math.max(-120, Math.min(120, dy)) * ZOOM_PER_PX)
}

/**
 * The dotted grid on screen (Ancung, 9 Nov: zoomed far out, 20 px dots shrank to 5 px apart and
 * shimmered). Like Figma and n8n, the grid doubles whenever its dots would sit closer than 14 px,
 * so on screen they are never closer than 14 px (14 to 28 px when zoomed out), and they fade a
 * little when zoomed out.
 */
export function gridOf(zoom: number): { spacing: number; opacity: number } {
  let spacing = 20 * zoom
  while (spacing < 14) spacing *= 2
  return { spacing, opacity: zoom >= 0.75 ? 1 : 0.55 + (zoom / 0.75) * 0.45 }
}

/**
 * The view during a pinch: the canvas point that sat between the fingers when it began stays
 * between them, scaled by how far apart they are now.
 */
export function pinchView(start: View, from: { d: number; x: number; y: number }, now: { d: number; x: number; y: number }): View {
  const zoom = clamp(start.zoom * (now.d / from.d))
  const k = zoom / start.zoom
  return { zoom, x: now.x - (from.x - start.x) * k, y: now.y - (from.y - start.y) * k }
}

/** Things inside the canvas that take the pointer themselves (cards, inputs, drag handles). */
const OWN_POINTER = "button, a, input, textarea, [draggable='true'], [role='button']"

export function useCanvasView() {
  const frame = useRef<HTMLElement>(null)
  const content = useRef<HTMLDivElement>(null)
  /** The zoom level text in the controls, updated without a re-render. */
  const zoomLabel = useRef<HTMLSpanElement>(null)
  const current = useRef<View>({ x: 0, y: TOP, zoom: 1 })
  const target = useRef<View>({ x: 0, y: TOP, zoom: 1 })
  const raf = useRef<number | null>(null)
  const [space, setSpace] = useState(false)
  const [panning, setPanning] = useState(false)
  const pan = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  /** Touch points on the canvas, and the pinch they make once there are two. */
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ view: View; d: number; x: number; y: number } | null>(null)
  /** A pinch happened since the last finger went down, so lifting it isn't a tap on empty canvas. */
  const pinched = useRef(false)

  const paint = useCallback(() => {
    const v = current.current
    if (content.current) content.current.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.zoom})`
    if (frame.current) {
      const g = gridOf(v.zoom)
      frame.current.style.backgroundPosition = `${v.x}px ${v.y}px`
      frame.current.style.backgroundSize = `${g.spacing}px ${g.spacing}px`
      frame.current.style.setProperty("--dot-opacity", String(g.opacity))
    }
    if (zoomLabel.current) zoomLabel.current.textContent = `${Math.round(v.zoom * 100)}%`
  }, [])

  // One frame of easing toward the target; schedules the next until it arrives.
  const step = useRef<() => void>(() => undefined)
  useEffect(() => {
    step.current = () => {
      const c = current.current
      const t = target.current
      const next = { x: c.x + (t.x - c.x) * EASE, y: c.y + (t.y - c.y) * EASE, zoom: c.zoom + (t.zoom - c.zoom) * EASE }
      const done = Math.abs(t.x - next.x) < 0.3 && Math.abs(t.y - next.y) < 0.3 && Math.abs(t.zoom - next.zoom) < 0.0005
      current.current = done ? t : next
      paint()
      raf.current = done ? null : requestAnimationFrame(() => step.current())
    }
  }, [paint])

  /** Move toward a view: eased, or at once (dragging, first layout, reduced motion). */
  const go = useCallback(
    (to: View | ((v: View) => View), now = false) => {
      target.current = typeof to === "function" ? to(target.current) : to
      const still = now || prefersReducedMotion()
      if (still) {
        if (raf.current !== null) cancelAnimationFrame(raf.current)
        raf.current = null
        current.current = target.current
        paint()
      } else if (raf.current === null) {
        raf.current = requestAnimationFrame(() => step.current())
      }
    },
    [paint]
  )
  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    },
    []
  )

  const sizes = useCallback(() => {
    const f = frame.current
    const c = content.current
    if (!f || !c) return null
    return { frame: { w: f.clientWidth, h: f.clientHeight }, content: { w: c.offsetWidth, h: c.offsetHeight } }
  }, [])

  /** 100%, centered across, from the top: where a job opens. */
  const reset = useCallback(
    (now = false) => {
      const s = sizes()
      if (s) go({ zoom: 1, x: (s.frame.w - s.content.w) / 2, y: TOP }, now)
    },
    [go, sizes]
  )

  const fit = useCallback(() => {
    const s = sizes()
    if (s) go(fitView(s.frame, s.content))
  }, [go, sizes])

  /** Zoom in or out around the frame's center (buttons, + and - keys). */
  const zoomBy = useCallback(
    (factor: number) => {
      const f = frame.current
      if (f) go((v) => zoomAround(v, v.zoom * factor, f.clientWidth / 2, f.clientHeight / 2))
    },
    [go]
  )

  // Open centered at 100%, before the first paint, without a glide (DOM only, no state).
  useLayoutEffect(() => {
    reset(true)
  }, [reset])

  // Wheel needs a non-passive listener: Ctrl/Cmd + wheel would zoom the whole page otherwise.
  useEffect(() => {
    const f = frame.current
    if (!f) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { dx, dy } = wheelPixels(e)
      if (e.ctrlKey || e.metaKey) {
        const box = f.getBoundingClientRect()
        go((v) => zoomAround(v, v.zoom * wheelZoomFactor(dy), e.clientX - box.left, e.clientY - box.top))
      } else {
        const { x, y } = wheelPan({ dx, dy, shift: e.shiftKey })
        go((v) => ({ ...v, x: v.x - x, y: v.y - y }))
      }
    }
    f.addEventListener("wheel", onWheel, { passive: false })
    return () => f.removeEventListener("wheel", onWheel)
  }, [go])

  // Two fingers pinch. Listened to in the capture phase, so a finger on a card counts too.
  useEffect(() => {
    const f = frame.current
    if (!f) return
    const local = (e: PointerEvent) => {
      const box = f.getBoundingClientRect()
      return { x: e.clientX - box.left, y: e.clientY - box.top }
    }
    const between = () => {
      const [a, b] = [...touches.current.values()]
      return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return
      if (touches.current.size === 0) pinched.current = false
      touches.current.set(e.pointerId, local(e))
      if (touches.current.size === 2) {
        // A one-finger pan becomes the pinch.
        pan.current = null
        setPanning(false)
        pinched.current = true
        pinch.current = { view: { ...target.current }, ...between() }
      }
    }
    const move = (e: PointerEvent) => {
      if (!touches.current.has(e.pointerId)) return
      touches.current.set(e.pointerId, local(e))
      const p = pinch.current
      if (p && touches.current.size >= 2) {
        e.preventDefault()
        go(pinchView(p.view, p, between()), true)
      }
    }
    const up = (e: PointerEvent) => {
      touches.current.delete(e.pointerId)
      if (touches.current.size < 2) pinch.current = null
    }
    f.addEventListener("pointerdown", down, true)
    f.addEventListener("pointermove", move, true)
    f.addEventListener("pointerup", up, true)
    f.addEventListener("pointercancel", up, true)
    return () => {
      f.removeEventListener("pointerdown", down, true)
      f.removeEventListener("pointermove", move, true)
      f.removeEventListener("pointerup", up, true)
      f.removeEventListener("pointercancel", up, true)
    }
  }, [go])

  // Space held (outside a text field) turns any drag into a pan, as in n8n and Figma.
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target) && !e.repeat) {
        e.preventDefault()
        setSpace(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false)
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (pinch.current) return
    const onBlock = e.target instanceof Element && e.target.closest(OWN_POINTER)
    const wants = e.button === 1 || (e.button === 0 && (space || !onBlock))
    if (!wants) return
    if (e.button === 1 || space) e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    setPanning(true)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const p = pan.current
    if (!p || p.id !== e.pointerId) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (Math.abs(dx) + Math.abs(dy) > 2) p.moved = true
    p.x = e.clientX
    p.y = e.clientY
    // Dragging follows the pointer exactly.
    go((v) => ({ ...v, x: v.x + dx, y: v.y + dy }), true)
  }
  /** Ends a pan; true if the pointer moved (so the click that follows isn't a deselect). */
  const endPan = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const p = pan.current
    if (!p || p.id !== e.pointerId) return pinched.current
    pan.current = null
    setPanning(false)
    return p.moved || pinched.current
  }

  return { frame, content, zoomLabel, space, panning, reset, fit, zoomBy, onPointerDown, onPointerMove, endPan }
}
