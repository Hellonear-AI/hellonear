"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

// Pan and zoom for the Builder canvas, the way n8n does it (docs.n8n.io/build/keyboard-shortcuts,
// read 9 Nov): scroll or two fingers move the view, Ctrl/Cmd + scroll (and a trackpad pinch) zooms
// around the pointer, and dragging empty canvas, Space + drag or the middle button moves it.
//
// Smooth (Ancung, 9 Nov: it stuttered and jumped): the view is written straight to the DOM once
// per frame, never through React state, so the Builder doesn't re-render while you move. Wheel and
// buttons ease toward where you're going; dragging follows the pointer 1:1.

export type View = { x: number; y: number; zoom: number }

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2
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

/** Zoom factor for one wheel event: capped so a fast wheel moves one notch at a time. */
export function wheelZoomFactor(dy: number): number {
  return Math.exp(-Math.max(-120, Math.min(120, dy)) * ZOOM_PER_PX)
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

  const paint = useCallback(() => {
    const v = current.current
    if (content.current) content.current.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.zoom})`
    if (frame.current) {
      frame.current.style.backgroundPosition = `${v.x}px ${v.y}px`
      frame.current.style.backgroundSize = `${20 * v.zoom}px ${20 * v.zoom}px`
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
      const still = now || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
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
        go((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
      }
    }
    f.addEventListener("wheel", onWheel, { passive: false })
    return () => f.removeEventListener("wheel", onWheel)
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
    if (!p || p.id !== e.pointerId) return false
    pan.current = null
    setPanning(false)
    return p.moved
  }

  return { frame, content, zoomLabel, space, panning, reset, fit, zoomBy, onPointerDown, onPointerMove, endPan }
}
