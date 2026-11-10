import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { MEDIA, matches, prefersReducedMotion } from "@/lib/media"

/**
 * Room above a pinned message: past the top fade, and on phones past the round Live view button
 * too (Ancung, 10 Nov). The last turn's min-height leaves the same room, so scrolling to the very
 * end puts the message where pinning put it, not under the fade. Read in the browser only.
 */
export function pinGap(): number {
  return matches(MEDIA.md) ? 24 : 60
}

/**
 * Where the chat sits (Ancung, 9 Nov, like Claude): an old thread opens at its end; a message
 * sent here glides its turn to the top, and the reply grows below without the view chasing it.
 * "Latest" shows whenever there is more below.
 */
export function useChatScroll(ready: boolean, pinKey: string | null) {
  const ref = useRef<HTMLDivElement>(null)
  const lastRef = useRef<HTMLDivElement>(null)
  const [viewHeight, setViewHeight] = useState(0)
  const [atBottom, setAtBottom] = useState(true)
  const placed = useRef<string | null>(null)

  const measure = useCallback(() => {
    const el = ref.current
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48)
  }, [])

  // The view's height (for the pinned turn's room) and content growth (for "Latest").
  useEffect(() => {
    const el = ref.current
    const content = el?.firstElementChild
    if (!el || !content) return
    const observer = new ResizeObserver(() => {
      setViewHeight(el.clientHeight)
      measure()
    })
    observer.observe(el)
    observer.observe(content)
    return () => observer.disconnect()
  }, [measure])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !ready || !viewHeight) return
    // Opening: go to the end (or to the turn just sent). After that, move only for a new message;
    // an approval, a resume or new text never moves the view (Ancung, 9 Nov).
    const first = placed.current === null
    if (!first && (!pinKey || placed.current === pinKey)) return
    const want = pinKey ?? "end"
    placed.current = want
    const reduce = prefersReducedMotion()
    if (pinKey && lastRef.current) {
      el.scrollTo({ top: lastRef.current.offsetTop - pinGap(), behavior: first || reduce ? "auto" : "smooth" })
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [ready, pinKey, viewHeight])

  const toBottom = useCallback(() => {
    const el = ref.current
    if (!el) return
    const reduce = prefersReducedMotion()
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" })
  }, [])

  return { ref, lastRef, onScroll: measure, atBottom, toBottom, viewHeight }
}
