// The media queries the app branches on, in one place. Widths match Tailwind's md, lg and xl.

export const MEDIA = {
  /** Tablets and up (768 px): phones below get drawers and the mobile header. */
  md: "(min-width: 768px)",
  /** Desktop Builder (1024 px): the Blocks panel and the settings panel beside the canvas. */
  lg: "(min-width: 1024px)",
  /** Wide desktop (1280 px): the full sidebar, and the live view beside the chat. */
  xl: "(min-width: 1280px)",
  /** Touch screens, by pointer rather than width. */
  coarse: "(pointer: coarse)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
} as const

/** Whether a media query matches right now; false outside the browser. */
export function matches(query: string): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches)
}

export const prefersReducedMotion = () => matches(MEDIA.reducedMotion)
