"use client"

import { createContext, useContext } from "react"
import type { Self } from "@/modules/builder/data/draft"

/** The Mind the Builder works for, read by the canvas and the panels instead of passed down. */
export type BuilderInfo = {
  mindId: string
  /** The Mind's name, for "Ask {name}" and the panels' words. */
  name: string
  /** The Mind's own wallet address, the default account a "Check a NEAR account" step looks at. */
  address: string
  /** Names the Mind's own wallet in results ("Balance of Omaga") instead of its long address. */
  self: Self
}

export const BuilderContext = createContext<BuilderInfo | null>(null)

export function useBuilder(): BuilderInfo {
  const info = useContext(BuilderContext)
  if (!info) throw new Error("useBuilder must be used inside the Builder")
  return info
}
