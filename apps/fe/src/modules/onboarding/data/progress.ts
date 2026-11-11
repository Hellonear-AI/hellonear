"use client"

import { useSyncExternalStore } from "react"
import { readPref, writePref } from "@/lib/storage"

// Getting started (Ancung, 11 Nov): what the checklist can't read from the backend, kept on this
// device. Most steps are read from real data (limits, balance, payments, connections); only "tried
// the live view" and "ran an attack", and hiding the checklist, live here.

export type Flag = "live" | "attack" | "hidden"

const key = (flag: Flag) => `hellonear.onboarding.${flag}`
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => e.key?.startsWith("hellonear.onboarding.") && listener()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/** Mark a step done (or the checklist hidden, or shown again with `false`). */
export function setFlag(flag: Flag, on = true) {
  if ((readPref(key(flag)) === "1") === on) return
  writePref(key(flag), on ? "1" : null)
  listeners.forEach((l) => l())
}

/** Read during render; the server can't know, so it says false (the checklist shows after hydration). */
export function useFlag(flag: Flag): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readPref(key(flag)) === "1",
    () => false
  )
}
