/**
 * This device's small preferences in localStorage. Storage can be missing or blocked (a private
 * window, strict site settings, a server render), so a read falls back and a write is dropped
 * instead of throwing.
 */
export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Not kept on this device; nothing else depends on it.
  }
}
