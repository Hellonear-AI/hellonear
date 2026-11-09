"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { loadedFirst } from "@/lib/historyNav"

// Asks before leaving the Builder with unsaved changes (Ancung, 9 Nov; the same trick as
// cia-web's useDraftGuard):
// - closing the tab, reloading or typing another address: the browser's own "Leave site?" prompt
//   (beforeunload; browsers show their own words, not ours). Listened to only while there are
//   changes: a beforeunload listener can keep a page out of the back-forward cache (MDN);
// - the browser's Back button: while there are changes, one extra history entry (#unsaved) sits
//   on top. Back pops it, popstate sees that, puts it back and asks; leaving then goes back two,
//   or to `fallback` when the Builder was the first page this tab loaded (nothing of ours behind);
// - the Builder's own back arrow: `leave(path)` asks first when there are changes.

const MARK = "#unsaved"
const here = () => window.location.pathname + window.location.search

export function useLeaveGuard(dirty: boolean, fallback: string) {
  const router = useRouter()
  // Where to go once the owner says leave: a path, or "back" for the browser's Back button.
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    if (dirty) window.addEventListener("beforeunload", beforeUnload)

    if (dirty && window.location.hash !== MARK) window.history.pushState(window.history.state, "", here() + MARK)
    if (!dirty && window.location.hash === MARK) window.history.replaceState(window.history.state, "", here())

    const popState = () => {
      if (!dirty || window.location.hash === MARK) return
      // Back took the extra entry off: put it back and ask.
      window.history.pushState(window.history.state, "", here() + MARK)
      setPending("back")
    }
    window.addEventListener("popstate", popState)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      window.removeEventListener("popstate", popState)
    }
  }, [dirty])

  /** Go to `path`, asking first when there are unsaved changes. */
  const leave = (path: string) => {
    if (dirty) setPending(path)
    else router.push(path)
  }

  /** Leave without saving, to where the owner was going. */
  const discard = () => {
    const to = pending
    setPending(null)
    // The extra entry is back on top, so the page before the Builder is two steps back.
    if (to === "back") {
      if (loadedFirst(window.location.pathname)) router.push(fallback)
      else window.history.go(-2)
    } else if (to) router.push(to)
  }

  return { asking: pending !== null, leave, discard, stay: () => setPending(null) }
}
