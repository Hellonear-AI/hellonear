// Minds of a session that ended in this tab (sign out, leaving a try-out, Connect Meteor). The
// browser's Back can still open their pages; those then go to `/` (the current account's newest
// Mind, or sign-in) instead of the not-found page (Ancung, 9 Nov). Only ids, per tab, like the
// history they come from.

const KEY = "hellonear.leftMinds"

export function leftMinds(): string[] {
  try {
    const ids: unknown = JSON.parse(window.sessionStorage.getItem(KEY) ?? "[]")
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

export function rememberLeftMinds(ids: string[]) {
  if (!ids.length) return
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify([...new Set([...leftMinds(), ...ids])].slice(-50)))
  } catch {
    // Storage can be blocked; Back then shows the not-found page, as before.
  }
}
