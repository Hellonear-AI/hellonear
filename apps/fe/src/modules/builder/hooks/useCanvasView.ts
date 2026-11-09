"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

// Pan and zoom for the Builder canvas, the way n8n does it (docs.n8n.io/build/keyboard-shortcuts,
// read 9 Nov): scroll or two fingers move the view, Ctrl/Cmd + scroll (and a trackpad pinch) zooms
// around the pointer, and dragging empty canvas, Space + drag or the middle button moves it.
// A CSS transform on the block column, so the blocks stay normal DOM (clicks, drag and drop).

export type View = { x: number; y: number; zoom: number }

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
const TOP = 32

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

/** Things inside the canvas that take the pointer themselves (cards, inputs, drag handles). */
const OWN_POINTER = "button, a, input, textarea, [draggable='true'], [role='button']"

export function useCanvasView() {
  const frame = useRef<HTMLElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: TOP, zoom: 1 })
  const [space, setSpace] = useState(false)
  const [panning, setPanning] = useState(false)
  const pan = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)

  const sizes = useCallback(() => {
    const f = frame.current
    const c = content.current
    if (!f || !c) return null
    return { frame: { w: f.clientWidth, h: f.clientHeight }, content: { w: c.offsetWidth, h: c.offsetHeight } }
  }, [])

  /** 100%, centered across, from the top: where a job opens. */
  const reset = useCallback(() => {
    const s = sizes()
    if (s) setView({ zoom: 1, x: (s.frame.w - s.content.w) / 2, y: TOP })
  }, [sizes])

  const fit = useCallback(() => {
    const s = sizes()
    if (s) setView(fitView(s.frame, s.content))
  }, [sizes])

  /** Zoom in or out around the frame's center (buttons, + and - keys). */
  const zoomBy = useCallback((factor: number) => {
    const f = frame.current
    if (!f) return
    setView((v) => zoomAround(v, v.zoom * factor, f.clientWidth / 2, f.clientHeight / 2))
  }, [])

  // Open centered at 100%, before the first paint.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one measurement of the laid-out canvas
    reset()
  }, [reset])

  // Wheel needs a non-passive listener: Ctrl/Cmd + wheel would zoom the whole page otherwise.
  useEffect(() => {
    const f = frame.current
    if (!f) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const box = f.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01)
        setView((v) => zoomAround(v, v.zoom * factor, e.clientX - box.left, e.clientY - box.top))
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    f.addEventListener("wheel", onWheel, { passive: false })
    return () => f.removeEventListener("wheel", onWheel)
  }, [])

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
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }
  /** Ends a pan; true if the pointer moved (so the click that follows isn't a deselect). */
  const endPan = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const p = pan.current
    if (!p || p.id !== e.pointerId) return false
    pan.current = null
    setPanning(false)
    return p.moved
  }

  return { frame, content, view, space, panning, reset, fit, zoomBy, onPointerDown, onPointerMove, endPan }
}
