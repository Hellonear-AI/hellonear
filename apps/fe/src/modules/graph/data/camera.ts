// The live view's camera (MindGraph): where the world sits in the canvas and how far it is zoomed.
// Screen points are canvas pixels from its top left; the world's origin is the canvas centre.

export type View = { x: number; y: number; k: number }
export type Size = { w: number; h: number }
type Point = { x: number; y: number }

/** Zoom limits: wheel and pinch go from 35% to 250%; fitting never zooms in past 140%. */
export const ZOOM = { min: 0.35, max: 2.5, fitMax: 1.4 } as const

export const clampZoom = (k: number, max: number = ZOOM.max) => Math.min(max, Math.max(ZOOM.min, k))

/** The world point under a screen point. */
export function toWorld(view: View, size: Size, p: Point): Point {
  return { x: (p.x - size.w / 2 - view.x) / view.k, y: (p.y - size.h / 2 - view.y) / view.k }
}

/**
 * The view at zoom `k` that puts the world point that was under `from` (seen with `before`) under
 * `to`: zooming around the pointer (`from` = `to`) or between two moving fingers.
 */
export function zoomAround(before: View, size: Size, from: Point, to: Point, k: number): View {
  const w = toWorld(before, size, from)
  return { k, x: to.x - size.w / 2 - w.x * k, y: to.y - size.h / 2 - w.y * k }
}

/** The view that frames a box of the world with a 24 px margin (`fit`). */
export function framing(box: { x0: number; y0: number; x1: number; y1: number }, size: Size): View {
  const k = clampZoom(Math.min((size.w - 48) / (box.x1 - box.x0 || 1), (size.h - 48) / (box.y1 - box.y0 || 1)), ZOOM.fitMax)
  return { k, x: -((box.x0 + box.x1) / 2) * k, y: -((box.y0 + box.y1) / 2) * k }
}
