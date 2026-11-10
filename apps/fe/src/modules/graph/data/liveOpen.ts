"use client"

import { useSyncExternalStore } from "react"

// Whether the live view is open beside the chat, remembered on this device. Read during render
// (useSyncExternalStore), not in an effect: every chat page mounts afresh, and starting open then
// closing in an effect flashed the panel open for a frame on each move (Ancung, 10 Nov).

const KEY = "hellonear.chat.live"
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off"
  } catch {
    return true
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => e.key === KEY && listener()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function setLiveOpen(open: boolean) {
  try {
    localStorage.setItem(KEY, open ? "on" : "off")
  } catch {
    // no storage: it still changes for this page
  }
  listeners.forEach((l) => l())
}

/**
 * Open or not. The server can't know, so its render (and hydration on a full load) says closed;
 * moving between chats renders on the client and reads the saved value from the first frame.
 */
export function useLiveOpen(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}
