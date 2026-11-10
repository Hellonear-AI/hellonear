"use client"

import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { CopyButton } from "@/components/elements/CopyButton"
import { prefersReducedMotion } from "@/lib/media"

// Chat streaming (design/CLAUDE.md, Motion): chunks are buffered and revealed at a steady pace,
// each new word fades in over about 150 ms, no fake cursor. A finished reply renders as Markdown.

// Whole words at a steady pace, like the AI SDK's smoothStream and Streamdown (Ancung, 11 Nov: 140
// characters a second still felt slow, and the reply stuttered). About 40 words a second, faster
// when text is waiting: a backlog drains in roughly a tenth of a second.
const BASE_CHARS_PER_SECOND = 220
const CATCH_UP = 10
// React renders the reply (a full Markdown parse) at most this often, not every frame: at 60 a
// second a long reply dropped frames, which read as stutter.
const COMMIT_MS = 33

/** The next word boundary at or after `at`, so a word never shows half typed. */
export function wordEnd(text: string, at: number): number {
  if (at >= text.length) return text.length
  const next = text.slice(at).search(/\s/)
  return next < 0 ? text.length : at + next
}

/** How much of `text` to show: all of it at once for history, a steady reveal while streaming. */
function useRevealed(text: string, live: boolean): number {
  const [shown, setShown] = useState(live ? 0 : text.length)
  const shownRef = useRef(shown)
  const target = useRef(text)

  useEffect(() => {
    target.current = text
    if (shownRef.current >= text.length) return
    if (prefersReducedMotion()) {
      shownRef.current = text.length
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion: show the new text at once
      setShown(text.length)
      return
    }
    let frame = 0
    let last = performance.now()
    let budget = 0
    let committed = last
    const tick = (now: number) => {
      const full = target.current
      const behind = full.length - shownRef.current
      // Catch up faster when far behind, so a long reply never lags after it arrived.
      budget += ((now - last) / 1000) * Math.max(BASE_CHARS_PER_SECOND, behind * CATCH_UP)
      last = now
      if (now - committed >= COMMIT_MS && budget >= 1) {
        const next = wordEnd(full, Math.min(full.length, shownRef.current + Math.floor(budget)))
        budget = Math.max(0, budget - (next - shownRef.current))
        shownRef.current = next
        committed = now
        setShown(next)
      }
      if (shownRef.current < target.current.length) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [text])

  return shown
}

export function ReplyText({ text, live }: { text: string; live: boolean }) {
  const shown = useRevealed(text, live)
  const streaming = live || shown < text.length
  // Markdown from the first word (Ancung, 9 Nov: "**" showed while streaming). While text still
  // arrives, a marker that isn't closed yet is closed for now, so it never shows as a symbol.
  const source = streaming ? closeOpenMarks(text.slice(0, shown)) : text
  // Made once per streaming state, not on every render: new component functions each frame made
  // React remount the whole reply as it grew, so every word restarted its fade from nothing and
  // a streaming reply showed only its list bullets (Ancung, 10 Nov).
  const components = useMemo(() => markdownParts(streaming), [streaming])

  return (
    <div className="flex flex-col gap-2.5 text-[15px] leading-[22px] break-words text-foreground [&_a]:font-medium [&_a]:underline [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[13px] [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_del]:text-muted-foreground [&_input]:mr-1.5 [&_li:has(input)]:list-none">
      {/* GFM: tables, strikethrough, task lists and bare links, as models write them (Ancung, 9 Nov: a table showed as pipes). */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

/** The Markdown elements, words fading in while it streams. */
function markdownParts(streaming: boolean): Components {
  const words = (children: ReactNode) => (streaming ? fadeWords(children) : children)
  return {
      // Wide tables scroll sideways inside the reply instead of widening the page (phones).
      table: ({ children }) => (
        <div className="max-w-full overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-left text-[14px]">{children}</table>
        </div>
      ),
      th: ({ children }) => <th className="border-b border-border bg-muted px-3 py-2 font-semibold whitespace-nowrap">{words(children)}</th>,
      td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top [tr:last-child_&]:border-b-0">{words(children)}</td>,
      p: ({ children }) => <p>{words(children)}</p>,
      li: ({ children }) => <li>{words(children)}</li>,
      strong: ({ children }) => <strong>{words(children)}</strong>,
      em: ({ children }) => <em>{words(children)}</em>,
      // Code blocks (fenced) sit in a box with their language and a Copy button (Ancung, 10 Nov).
      // Inline code keeps the small grey chip from the wrapper's classes.
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {words(children)}
        </a>
      ),
  }
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

/** A fenced code block: the language above it, Copy at the right, the code scrolling sideways. */
function CodeBlock({ children }: { children: ReactNode }) {
  const pre = useRef<HTMLPreElement>(null)
  const code = Children.toArray(children)[0] as { props?: { className?: string } } | undefined
  const lang = code?.props?.className?.match(/language-([\w+#-]+)/)?.[1] ?? null
  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/60">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1">
        <span className="text-xs text-muted-foreground">{lang ?? "Code"}</span>
        <CopyButton text={() => pre.current?.textContent ?? ""} showLabel />
      </div>
      <pre ref={pre} className="overflow-x-auto px-3 py-2.5 font-mono text-[13px] leading-5 [&_code]:bg-transparent! [&_code]:p-0! [&_code]:text-[13px]">
        {children}
      </pre>
    </div>
  )
}
