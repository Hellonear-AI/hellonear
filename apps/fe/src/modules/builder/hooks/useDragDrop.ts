"use client"

import { createContext, useContext, useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from "react"
import type { Kind } from "@/modules/builder/data/blocks"
import { canPlace, findBlock, insertBlock, locate, withLine, type Block, type Draft, type Self } from "@/modules/builder/data/draft"
import { samePath, type Place } from "@/modules/builder/data/places"

/** What is being dragged: a new block from the palette, or a block (an If with its ways) to move. */
export type Drag = { add: Kind } | { move: string }

/** Drag and drop (B1.7): a block from the palette, or a block (an If with its ways) to a new place. */
export function useDragDrop({
  line,
  setDraft,
  self,
  onAdd,
}: {
  line: Block[]
  setDraft: Dispatch<SetStateAction<Draft>>
  self: Self
  /** Adds a new block of a kind at a place (and picks it). */
  onAdd: (kind: Kind, at: Place) => void
}) {
  const [drag, setDrag] = useState<Drag | null>(null)
  // The drop target under the pointer, by its id.
  const [over, setOver] = useState<string | null>(null)
  // The drop spots show a frame after dragstart (a layout change during dragstart cancels the
  // drag in Chrome), and not at all if the drag already ended by then.
  const dragging = useRef(false)
  const startDrag = (d: Drag) => {
    dragging.current = true
    requestAnimationFrame(() => {
      if (dragging.current) setDrag(d)
    })
  }
  const endDrag = () => {
    dragging.current = false
    setDrag(null)
    setOver(null)
  }
  /** Move a block (an If with its ways) to a place; a place after it in its own line shifts back by one. */
  function moveBlock(id: string, to: Place) {
    setDraft((d) => {
      const from = locate(d.line, id)
      const blk = findBlock(d.line, id)
      if (!from || !blk) return d
      const without = withLine(d.line, from.path, (l) => l.filter((x) => x.id !== id))
      const same = samePath(from.path, to.path)
      return { ...d, line: insertBlock(without, to.path, same && from.index < to.index ? to.index - 1 : to.index, blk) }
    })
  }
  function dropAt(at: Place) {
    if (!drag) return
    if ("move" in drag) moveBlock(drag.move, at)
    else onAdd(drag.add, at)
    endDrag()
  }
  /** Where a dragged thing may land, by the engine's tree rules (#164). */
  function accepts(at: Place): boolean {
    if (!drag) return false
    if ("move" in drag) {
      const blk = findBlock(line, drag.move)
      const from = locate(line, drag.move)
      if (!blk || !from) return false
      // Not into its own ways, and not onto its own place.
      if (at.path.some((x) => x.at === drag.move)) return false
      if (samePath(from.path, at.path) && (at.index === from.index || at.index === from.index + 1)) return false
      return canPlace(line, at.path, at.index, blk.kind, self)
    }
    return canPlace(line, at.path, at.index, drag.add, self)
  }
  return { drag, over, setOver, startDrag, endDrag, dropAt, accepts }
}

export type DragDrop = ReturnType<typeof useDragDrop>

/** The drag in progress, for the canvas's drop targets and the palette's items. */
export const DragContext = createContext<DragDrop | null>(null)

export function useDrag(): DragDrop {
  const dnd = useContext(DragContext)
  if (!dnd) throw new Error("useDrag must be used inside the Builder")
  return dnd
}

/**
 * A place a dragged block may land: lit while hovered, and it takes the drop only when `accepts`.
 * Spread the handlers on the element.
 */
export function useDropTarget(id: string, accepts: boolean, onDrop: () => void) {
  const { over, setOver } = useDrag()
  const hot = over === id
  return {
    hot,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!accepts) return
        e.preventDefault()
        if (!hot) setOver(id)
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
      },
      onDrop: (e: DragEvent) => {
        if (!accepts) return
        e.preventDefault()
        onDrop()
      },
    },
  }
}
