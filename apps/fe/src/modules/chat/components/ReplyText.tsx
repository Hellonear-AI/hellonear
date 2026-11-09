"use client"

import { Children, useEffect, useRef, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

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
  const streaming = live || shown < text.length
  // Markdown from the first word (Ancung, 9 Nov: "**" showed while streaming). While text still
  // arrives, a marker that isn't closed yet is closed for now, so it never shows as a symbol.
  const source = streaming ? closeOpenMarks(text.slice(0, shown)) : text
  const words = (children: ReactNode) => (streaming ? fadeWords(children) : children)

  return (
    <div className="flex flex-col gap-2.5 text-[15px] leading-[22px] break-words text-foreground [&_a]:font-medium [&_a]:underline [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[13px] [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_del]:text-muted-foreground [&_input]:mr-1.5 [&_li:has(input)]:list-none">
      {/* GFM: tables, strikethrough, task lists and bare links, as models write them (Ancung, 9 Nov: a table showed as pipes). */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Wide tables scroll sideways inside the reply instead of widening the page (phones).
          table: ({ children }) => (
            <div className="max-w-full overflow-x-auto rounded-md border border-border">
              <table className="w-full border-collapse text-left text-[14px]">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-border bg-muted px-3 py-2 font-semibold whitespace-nowrap">{words(children)}</th>,
          td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top last:border-b-0 [tr:last-child_&]:border-b-0">{words(children)}</td>,
          p: ({ children }) => <p>{words(children)}</p>,
          li: ({ children }) => <li>{words(children)}</li>,
          strong: ({ children }) => <strong>{words(children)}</strong>,
          em: ({ children }) => <em>{words(children)}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {words(children)}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

/** Each new word fades in over 150 ms; index keys keep words already shown from fading again. */
function fadeWords(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string"
      ? child.split(/(\s+)/).map((word, i) =>
          /^\s*$/.test(word) ? (
            word
          ) : (
            <span key={i} className="animate-in fade-in-0 duration-150 ease-out motion-reduce:animate-none">
              {word}
            </span>
          )
        )
      : child
  )
}

/** Close a "**" or "`" that is still open in half-streamed Markdown. */
export function closeOpenMarks(text: string): string {
  // Inner first: in "**pay `x" the code mark opened last, so it closes first.
  let out = text
  const ticks = out.replace(/```/g, "").match(/`/g)?.length ?? 0
  if (ticks % 2 === 1) out += "`"
  if ((out.match(/\*\*/g)?.length ?? 0) % 2 === 1) out += "**"
  return out
}
