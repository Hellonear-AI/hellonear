"use client"

import { Children, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { CopyButton } from "@/components/elements/CopyButton"
import { prefersReducedMotion } from "@/lib/media"

// Chat streaming (design/CLAUDE.md, Motion): chunks are buffered and revealed at a steady pace,
// each new word fades in over about 200 ms, no fake cursor. A finished reply renders as Markdown.

// Whole words at the pace the text arrives (Ancung, 12 Nov: it still read choppy). Measured on the
// hosted demo: the model sends about 45 characters a second, in bursts every 0.5 s. A fixed
// 220 a second showed each burst at once and then waited, so words came in clumps half a second
// apart. Now the reply plays the text as it stood a short delay ago, spread evenly between the
// bursts (like a video player's buffer); the delay follows how far apart the bursts are.
const BASE_CHARS_PER_SECOND = 220
/** Once the stream has ended, the rest shows within about this long. */
const DRAIN_SECONDS = 0.8
/** How quickly the drain speed follows its target each frame (0 to 1). */
const SPEED_EASE = 0.12
/** The playout delay: a little longer than the usual gap between bursts, within these bounds. */
const MIN_DELAY_MS = 120
const MAX_DELAY_MS = 700

/** When each length of the text arrived. */
export type Arrival = { t: number; len: number }

/**
 * How much text to show at `at` (a time `delay` behind now): the arrivals joined by straight
 * lines, so the text grows evenly between bursts instead of jumping at each one.
 */
export function playoutLength(arrivals: Arrival[], at: number): number {
  let len = 0
  for (let i = 0; i < arrivals.length; i++) {
    const a = arrivals[i]
    if (at < a.t) break
    const b = arrivals[i + 1]
    len = b && at < b.t ? a.len + ((b.len - a.len) * (at - a.t)) / (b.t - a.t) : (b?.len ?? a.len)
  }
  return len
}

/** The delay for these arrivals: the larger usual gap (the third largest of the last ten), bounded. Pauses for a tool don't count. */
export function playoutDelay(arrivals: Arrival[]): number {
  const recent = arrivals.slice(-11)
  const gaps = recent
    .slice(1)
    .map((a, i) => a.t - recent[i].t)
    .filter((g) => g < 1500)
    .sort((x, y) => y - x)
  const usual = gaps[Math.min(2, gaps.length - 1)] ?? 0
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, usual * 1.1))
}

/** The next word boundary at or after `at`, so a word never shows half typed. */
export function wordEnd(text: string, at: number): number {
  if (at >= text.length) return text.length
  const next = text.slice(at).search(/\s/)
  return next < 0 ? text.length : at + next
}

/**
 * The reply cut into blocks at blank lines, never inside a fenced code block. While streaming,
 * only the last block still changes, so the ones before it keep their rendered Markdown and
 * aren't parsed again on every frame (like Vercel's Streamdown). A long reply re-parsed whole each
 * update dropped frames.
 */
export function splitBlocks(text: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let fenced = false
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (!fenced && line.trim() === "" && current.length && current.some((l) => l.trim() !== "")) {
      blocks.push(current.join("\n"))
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length) blocks.push(current.join("\n"))
  return blocks
}

/** How much of `text` to show: all of it at once for history, a steady reveal while streaming. */
function useRevealed(text: string, live: boolean): number {
  const [shown, setShown] = useState(live ? 0 : text.length)
  const shownRef = useRef(shown)
  const target = useRef(text)
  const liveRef = useRef(live)
  const arrivals = useRef<Arrival[]>([])
  const speed = useRef(BASE_CHARS_PER_SECOND)

  useEffect(() => {
    liveRef.current = live
  }, [live])

  useEffect(() => {
    target.current = text
    const now = performance.now()
    const log = arrivals.current
    if (text.length > (log.at(-1)?.len ?? 0)) {
      // The first burst starts as if it had come in at the base speed, so it doesn't sit hidden for the whole delay.
      if (!log.length) log.push({ t: now - (text.length / BASE_CHARS_PER_SECOND) * 1000, len: shownRef.current })
      log.push({ t: now, len: text.length })
    }
    if (shownRef.current >= text.length) return
    if (prefersReducedMotion()) {
      shownRef.current = text.length
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion: show the new text at once
      setShown(text.length)
      return
    }
    let frame = 0
    let last = now
    let budget = 0
    const tick = (at: number) => {
      const full = target.current
      const dt = Math.min(0.1, (at - last) / 1000)
      last = at
      let goal: number
      if (liveRef.current) {
        // While it streams: the text as it stood a short delay ago, spread evenly between bursts.
        goal = playoutLength(arrivals.current, at - playoutDelay(arrivals.current))
      } else {
        // The stream ended: show the rest within DRAIN_SECONDS, never slower than the base.
        const want = Math.max(BASE_CHARS_PER_SECOND, (full.length - shownRef.current) / DRAIN_SECONDS)
        speed.current += (want - speed.current) * SPEED_EASE
        budget += dt * speed.current
        goal = shownRef.current + budget
      }
      const next = wordEnd(full, Math.min(full.length, Math.floor(goal)))
      if (next > shownRef.current) {
        budget = Math.max(0, budget - (next - shownRef.current))
        shownRef.current = next
        // Only the last block re-renders, so a frame stays cheap.
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
  const source = streaming ? text.slice(0, shown) : text
  const blocks = useMemo(() => splitBlocks(source), [source])

  return (
    <div className="flex flex-col gap-2.5 text-[15px] leading-[22px] break-words text-foreground [&_a]:font-medium [&_a]:underline [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[13px] [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_del]:text-muted-foreground [&_input]:mr-1.5 [&_li:has(input)]:list-none">
      {blocks.map((block, i) => {
        const open = streaming && i === blocks.length - 1
        return <Block key={i} text={open ? closeOpenMarks(block) : block} streaming={open} />
      })}
    </div>
  )
}

/**
 * One block of the reply. Memoised on its text: a block that is done doesn't render again while
 * the next one streams. Blocks sit in a `contents` box, so the wrapper's spacing applies to the
 * paragraphs, lists and tables inside as before.
 */
const Block = memo(function Block({ text, streaming }: { text: string; streaming: boolean }) {
  // Made once per streaming state, not on every render: new component functions each frame made
  // React remount the block as it grew, so every word restarted its fade (Ancung, 10 Nov).
  const components = useMemo(() => markdownParts(streaming), [streaming])
  return (
    <div className="contents">
      {/* GFM: tables, strikethrough, task lists and bare links, as models write them (Ancung, 9 Nov: a table showed as pipes). */}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})

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

/** Each new word fades in over 200 ms; index keys keep words already shown from fading again. */
function fadeWords(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string"
      ? child.split(/(\s+)/).map((word, i) =>
          /^\s*$/.test(word) ? (
            word
          ) : (
            <span key={i} className="animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none">
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
