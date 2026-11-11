"use client"

import { useEffect, useState } from "react"
import { BLOCKED_HINT_MS } from "@/modules/wallet/data/ownerAction"

/** True once `waiting` has lasted BLOCKED_HINT_MS: Meteor's window may have been blocked (#260). */
export function useBlockedHint(waiting: boolean): boolean {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!waiting) return
    const t = setTimeout(() => setLate(true), BLOCKED_HINT_MS)
    return () => {
      clearTimeout(t)
      setLate(false)
    }
  }, [waiting])
  return waiting && late
}
