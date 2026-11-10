"use client"

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react"
import { cn } from "cn"
import { PROMPT_MAX, type PromptPart } from "@/modules/builder/data/draft"

// Earlier results show as chips, inside the prompt field and on the block cards (Ancung, 10 Nov:
// "{Balance of Omaga}" in the text read like code). What is saved stays the engine's
// {{steps.id.field}}; a chip only carries that reference and the words people see.

const CHIP = {
  tool: "bg-info-soft text-info",
  http: "bg-node-app/15 text-node-app",
} as const

type ChipTone = "tool" | "http" | undefined

const chipClass = (tone: ChipTone) =>
  cn("mx-px inline rounded-[6px] px-1.5 py-px align-baseline text-[0.9em] font-medium whitespace-nowrap", CHIP[tone ?? "tool"])

/** A prompt as text with chips, for cards and lists (read only). */
export function PromptPreview({ parts, className }: { parts: PromptPart[]; className?: string }) {
  return (
    <span className={className}>
      {parts.map((p, i) =>
        "chip" in p ? (
          <span key={i} className={chipClass(p.tone)}>
            {p.chip}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  )
}

export type PromptEditorHandle = {
  /** Puts a chip where the caret is (or last was; at the end if the field wasn't used yet). */
  insert: (ref: string, label: string, tone: ChipTone) => void
}

function chipNode(ref: string, label: string, tone: ChipTone) {
  const el = document.createElement("span")
  el.contentEditable = "false"
  el.dataset.ref = ref
  el.className = chipClass(tone)
  el.textContent = label
  return el
}

/** A hidden <br> after a last "\n", which a pre-wrap box needs to show the empty line. */
function tail() {
  const br = document.createElement("br")
  br.dataset.tail = ""
  return br
}

/** The field's text back as the engine reads it: a chip is its reference, a line break is "\n". */
function read(node: Node): string {
  let out = ""
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue ?? ""
    else if (n instanceof HTMLElement) {
      if (n.dataset.ref) out += n.dataset.ref
      else if (n.dataset.tail !== undefined) return
      else if (n.tagName === "BR") out += "\n"
      else {
        // Some browsers wrap a new line in a <div>.
        const inner = read(n)
        out += (/^(DIV|P)$/.test(n.tagName) && out && !out.endsWith("\n") ? "\n" : "") + inner
      }
    }
  })
  return out
}

/**
 * The prompt field: plain text with result chips in it. A contentEditable box (plaintext-only, so
 * pasting brings no formatting); chips can't be typed into and go with one Backspace. It is filled
 * from `value` only when the value changed from outside (undo, another block), so typing never
 * loses the caret.
 */
export function PromptEditor({
  value,
  parts,
  onChange,
  placeholder,
  labelledBy,
  ref,
}: {
  value: string
  /** `value` split into text and chips, to fill the field. */
  parts: PromptPart[]
  onChange: (value: string) => void
  placeholder?: string
  labelledBy?: string
  ref?: Ref<PromptEditorHandle>
}) {
  const box = useRef<HTMLDivElement>(null)
  const sent = useRef<string | null>(null)
  const shape = useRef("")
  const saved = useRef<Range | null>(null)
  // Set by our own edits, so the effect below doesn't refill the field (and lose the caret).
  const own = useRef(false)
  const [empty, setEmpty] = useState(!value)

  // Fill the field when the value (or a chip's words) changed from outside.
  const nextShape = JSON.stringify(parts)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    if (own.current && value === sent.current) {
      own.current = false
      shape.current = nextShape
      return
    }
    if (value === sent.current && nextShape === shape.current) return
    el.replaceChildren(...parts.map((p) => ("chip" in p ? chipNode(p.ref, p.chip, p.tone) : document.createTextNode(p.text))))
    if (value.endsWith("\n")) el.append(tail())
    sent.current = value
    shape.current = nextShape
  }, [value, parts, nextShape])

  // Remember where the caret was, so a chip clicked below goes there.
  useEffect(() => {
    const keep = () => {
      const sel = document.getSelection()
      if (sel?.rangeCount && box.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange()
    }
    document.addEventListener("selectionchange", keep)
    return () => document.removeEventListener("selectionchange", keep)
  }, [])

  const emit = () => {
    const el = box.current
    if (!el) return
    const text = read(el).slice(0, PROMPT_MAX)
    own.current = true
    sent.current = text
    setEmpty(!el.textContent && !el.querySelector("[data-ref]"))
    onChange(text)
  }

  /** Puts "\n" at the caret; at the very end a hidden <br> makes the new empty line show. */
  const newLine = () => {
    const el = box.current
    const sel = document.getSelection()
    if (!el || !sel?.rangeCount || !el.contains(sel.anchorNode)) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const nl = document.createTextNode("\n")
    range.insertNode(nl)
    // Nothing but a tail after the caret: the new line needs the tail to show.
    const rest = document.createRange()
    rest.setStartAfter(nl)
    rest.setEnd(el, el.childNodes.length)
    if (!rest.toString() && !el.querySelector("[data-tail]")) el.append(tail())
    const after = document.createRange()
    after.setStartAfter(nl)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)
    emit()
  }

  useImperativeHandle(ref, () => ({
    insert(refText, label, tone) {
      const el = box.current
      if (!el) return
      let range = saved.current && el.contains(saved.current.startContainer) ? saved.current : null
      if (!range) {
        range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
      }
      range.deleteContents()
      const chip = chipNode(refText, label, tone)
      const space = document.createTextNode(" ")
      range.insertNode(space)
      range.insertNode(chip)
      const before = chip.previousSibling
      if (before?.nodeType === Node.TEXT_NODE && before.nodeValue && !/\s$/.test(before.nodeValue)) el.insertBefore(document.createTextNode(" "), chip)
      const caret = document.createRange()
      caret.setStartAfter(space)
      caret.collapse(true)
      el.focus()
      const sel = document.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(caret)
      saved.current = caret.cloneRange()
      emit()
    },
  }))

  return (
    <div className="relative">
      <div
        ref={box}
        role="textbox"
        aria-multiline
        aria-labelledby={labelledBy}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        onInput={emit}
        onKeyDown={(e) => {
          // A new line is a "\n" in the text, not a <div> or <br> from the browser.
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault()
            newLine()
          }
        }}
        className="min-h-36 w-full rounded-md border border-input bg-surface px-3.5 py-2.5 text-base leading-7 break-words whitespace-pre-wrap text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-sm md:leading-6"
      />
      {empty && placeholder && (
        <span aria-hidden className="pointer-events-none absolute top-2.5 left-3.5 right-3.5 text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
          {placeholder}
        </span>
      )}
    </div>
  )
}
