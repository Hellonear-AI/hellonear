"use client"

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react"

/** Undo goes back this many changes. */
export const HISTORY_LIMIT = 50
/** Changes this close together (typing) count as one. */
export const TYPING_MERGE_MS = 1000

/**
 * Undo and redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) for a value kept in state: earlier values, up to
 * HISTORY_LIMIT. Typing within a second counts as one change.
 */
export function useHistory<T>(value: T, setValue: Dispatch<SetStateAction<T>>) {
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const prev = useRef(value)
  const fromHistory = useRef(false)
  const lastChange = useRef(0)
  useEffect(() => {
    if (prev.current === value) return
    if (fromHistory.current) {
      fromHistory.current = false
    } else {
      const now = Date.now()
      if (now - lastChange.current > TYPING_MERGE_MS || !past.current.length) {
        past.current.push(prev.current)
        if (past.current.length > HISTORY_LIMIT) past.current.shift()
      }
      lastChange.current = now
      future.current = []
    }
    prev.current = value
  }, [value])
  const undo = () => {
    const back = past.current.pop()
    if (!back) return
    future.current.push(value)
    fromHistory.current = true
    setValue(back)
  }
  const redo = () => {
    const ahead = future.current.pop()
    if (!ahead) return
    past.current.push(value)
    fromHistory.current = true
    setValue(ahead)
  }
  return { undo, redo }
}
