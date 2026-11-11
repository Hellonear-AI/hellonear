// Places in the job tree and the ids the Builder picks things by.

import { lineCloses, locate, type Block, type IfBlock, type LinePath } from "@/modules/builder/data/draft"

/** A place in the tree: the line's path and an index in it. */
export type Place = { path: LinePath; index: number }

/** The Start block's id on the canvas and in the selection. */
export const START = "start"

/** A key for a place, for React keys and drop-target ids. */
export const placeKey = (at: Place) => `${at.path.map((x) => `${x.at}:${x.h}`).join("/")}#${at.index}`

export const samePath = (a: LinePath, b: LinePath) => JSON.stringify(a) === JSON.stringify(b)

/** The end of the main line, where a tap in the Blocks panel adds. */
export const mainEnd = (line: Block[]): Place => ({ path: [], index: line.length })

/** An empty or open way's slot is picked as "{ifId}:then" / "{ifId}:else". */
export const slotId = (ifId: string, h: "then" | "else") => `${ifId}:${h}`

export function parseSlot(id: string | null): { ifId: string; h: "then" | "else" } | null {
  const m = id?.match(/^(.+):(then|else)$/)
  return m ? { ifId: m[1], h: m[2] as "then" | "else" } : null
}

/** Where a way's slot adds: the end of that way. */
export function slotPlace(line: Block[], b: IfBlock, h: "then" | "else"): Place {
  const here = locate(line, b.id)
  return { path: [...(here?.path ?? []), { at: b.id, h }], index: b[h].length }
}

/**
 * Whether a line's end takes another block: not after a path that ends, and not after an If,
 * which goes on in its own ways.
 */
export const takesMore = (line: Block[]) => !lineCloses(line) && line.at(-1)?.kind !== "if"
