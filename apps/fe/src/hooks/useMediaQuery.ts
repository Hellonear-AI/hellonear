"use client"

import { useSyncExternalStore } from "react"

/** Whether a media query matches, kept in step with the window. `onServer` is the server render's answer. */
export function useMediaQuery(query: string, onServer = false): boolean {
  return useSyncExternalStore(
    (on) => {
      const q = window.matchMedia(query)
      q.addEventListener("change", on)
      return () => q.removeEventListener("change", on)
    },
    () => window.matchMedia(query).matches,
    () => onServer
  )
}
