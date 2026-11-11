// Whether the current page was reached with the browser's Back or Forward, so a page from an
// earlier session (another account, a try-out that ended) can go home instead of showing a 404.
// Two ways to get here: a popstate inside the app, or a full page load from history (after the
// reload that "Connect Meteor" does).

let lastPopAt = Number.NEGATIVE_INFINITY
let firstPath: string | null = null
let firstLoadFromHistory = false

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastPopAt = performance.now()
  })
  firstPath = window.location.pathname
  const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined
  firstLoadFromHistory = nav?.type === "back_forward"
}

/** Call when the page mounts: true right after a Back/Forward to `path`. */
export function cameByHistory(path: string): boolean {
  if (performance.now() - lastPopAt < 2000) return true
  return firstLoadFromHistory && path === firstPath
}

/**
 * True when `path` is the page this tab loaded first (a link, a new tab, a reload), so there may
 * be no page of the app behind it in history. The Builder's leave guard then goes to Autopilot
 * instead of stepping back out of HelloNear.
 */
export function loadedFirst(path: string): boolean {
  return path === firstPath
}
