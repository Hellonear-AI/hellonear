"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(pointer: coarse)"

/**
 * True on touch screens (phones, tablets). Pickers use the device's own there (Ancung, 10 Nov;
 * design B1.6: "Phones use the phone's own picker"): the iOS and Android wheels and sheets suit a
 * finger better than a small popover. By pointer, not width, so a narrow laptop window keeps the
 * desktop pickers. The server renders the desktop ones.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (on) => {
      const q = window.matchMedia(QUERY)
      q.addEventListener("change", on)
      return () => q.removeEventListener("change", on)
    },
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
