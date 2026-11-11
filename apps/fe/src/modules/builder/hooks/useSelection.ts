"use client"

import { useState } from "react"
import { MEDIA, matches } from "@/lib/media"
import { allBlocks, findBlock, type Block } from "@/modules/builder/data/draft"
import { parseSlot, START } from "@/modules/builder/data/places"

/** What is picked on the canvas: Start, a block, or an If's way (its slot), and what that is. */
export function useSelection(line: Block[]) {
  // The block whose settings show on the right; null closes that panel (n8n opens it on demand).
  // Desktop opens on Start's settings; phones open on the canvas, since settings are a sheet there.
  const [selected, setSelected] = useState<string | null>(() => (matches(MEDIA.lg) ? START : null))
  const picked = selected ? findBlock(line, selected) : null
  const slotRef = parseSlot(selected)
  const slotIf = slotRef ? findBlock(line, slotRef.ifId) : null
  const slot = slotIf?.kind === "if" && slotRef ? { block: slotIf, h: slotRef.h } : null

  /** Up and Down: the block above or below in reading order, Start first. */
  const pickNext = (down: boolean) => {
    const order = [START, ...allBlocks(line).map((x) => x.id)]
    const i = selected ? order.indexOf(selected) : -1
    const next = down ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1)
    setSelected(order[next] ?? START)
  }

  return {
    selected,
    select: setSelected,
    picked,
    slot,
    pickNext,
    /** "]": close the settings, or open them on Start. */
    toggle: () => setSelected((sel) => (sel ? null : START)),
  }
}
