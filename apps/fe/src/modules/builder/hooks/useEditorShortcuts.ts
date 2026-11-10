"use client"

import { useEffect, useRef } from "react"

/** What each of the Builder's keys does; ShortcutsDialog lists them. */
export type ShortcutHandlers = {
  save: () => void
  testRun: () => void
  undo: () => void
  redo: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  fit: () => void
  togglePalette: () => void
  toggleSettings: () => void
  help: () => void
  closeSettings: () => void
  deleteBlock: () => void
  /** Up and Down: the block below (true) or above. */
  pick: (down: boolean) => void
}

/** Typing in a field, or working a list or a dialog: letters and arrows are theirs. */
function isTyping(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null
  return Boolean(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest("[role='listbox'], [role='option'], [role='dialog']")))
}

function onKey(e: KeyboardEvent, h: ShortcutHandlers) {
  const mod = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (mod && k === "s") {
    e.preventDefault()
    h.save()
    return
  }
  if (mod && e.key === "Enter") {
    e.preventDefault()
    h.testRun()
    return
  }
  if (isTyping(e.target)) return
  if (mod && k === "z") {
    e.preventDefault()
    if (e.shiftKey) h.redo()
    else h.undo()
    return
  }
  if (mod) return
  if (e.key === "+" || e.key === "=") h.zoomIn()
  else if (e.key === "-" || e.key === "_") h.zoomOut()
  else if (e.key === "0") h.resetZoom()
  else if (e.key === "1") h.fit()
  else if (e.key === "[") h.togglePalette()
  else if (e.key === "]") h.toggleSettings()
  else if (e.key === "?") h.help()
  else if (e.key === "Escape") h.closeSettings()
  else if (e.key === "Delete" || e.key === "Backspace") h.deleteBlock()
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") h.pick(e.key === "ArrowDown")
  else return
  e.preventDefault()
}

/**
 * Keyboard shortcuts (n8n's, the simple ones; "?" lists them). Letters and arrows wait while you
 * type in a field; Save and Test run work from anywhere. One listener; the handlers are the
 * latest render's.
 */
export function useEditorShortcuts(handlers: ShortcutHandlers) {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  useEffect(() => {
    const on = (e: KeyboardEvent) => onKey(e, latest.current)
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [])
}
