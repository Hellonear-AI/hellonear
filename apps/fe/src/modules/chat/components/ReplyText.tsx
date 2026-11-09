"use client"

import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"

// Chat streaming (design/CLAUDE.md, Motion): chunks are buffered and revealed at a steady pace,
// each new word fades in over about 150 ms, no fake cursor. A finished reply renders as Markdown.

const BASE_CHARS_PER_SECOND = 70

/** How much of `text` to show: all of it at once for history, a steady reveal while streaming. */
function useRevealed(text: string, live: boolean): number {
  const [shown, setShown] = useState(live ? 0 : text.length)
  const shownRef = useRef(shown)
  const target = useRef(text.length)

  useEffect(() => {
    target.current = text.length
    if (shownRef.current >= target.current) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = target.current
      setShown(target.current)
      return
    }
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const behind = target.current - shownRef.current
      // Catch up faster when far behind, so a long reply never lags seconds after it arrived.
      const speed = Math.max(BASE_CHARS_PER_SECOND, behind * 4)
      const step = Math.max(1, Math.floor(((now - last) / 1000) * speed))
      last = now
      shownRef.current = Math.min(target.current, shownRef.current + step)
      setShown(shownRef.current)
      if (shownRef.current < target.current) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [text.length])

  return shown
}

export function ReplyText({ text, live }: { text: string; live: boolean }) {
  const shown = useRevealed(text, live)
  const done = !live && shown >= text.length

  if (done) {
    return (
      <div className="flex flex-col gap-2.5 text-[15px] leading-[22px] break-words text-foreground [&_a]:font-medium [&_a]:underline [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[13px] [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    )
  }

  // Index keys keep words already shown from fading in again; only new words animate.
  const words = text.slice(0, shown).split(/(\s+)/)
  return (
    <p className="text-[15px] leading-[22px] break-words whitespace-pre-wrap text-foreground">
      {words.map((word, i) =>
        /^\s+$/.test(word) ? (
          word
        ) : (
          <span key={i} className="animate-in fade-in-0 duration-150 ease-out motion-reduce:animate-none">
            {word}
          </span>
        )
      )}
    </p>
  )
}
