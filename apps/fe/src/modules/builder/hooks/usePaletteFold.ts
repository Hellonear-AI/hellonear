"use client"

import { useState } from "react"
import { readPref, writePref } from "@/lib/storage"

/** Where this device remembers whether the Blocks panel is folded. */
export const PALETTE_KEY = "hellonear.builder.palette"

/** The Blocks panel folds to icons ("["); remembered on this device. */
export function usePaletteFold() {
  const [open, setOpen] = useState(() => readPref(PALETTE_KEY) !== "closed")
  const toggle = () =>
    setOpen((was) => {
      writePref(PALETTE_KEY, was ? "closed" : "open")
      return !was
    })
  return { open, toggle }
}
