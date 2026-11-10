"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "cn"

/**
 * Copies text and says so for a moment (a check in place of the icon), like Claude and ChatGPT.
 * `text` can be a function, read at click time (a code block reads its own DOM).
 */
export function CopyButton({
  text,
  label = "Copy",
  showLabel = false,
  className,
}: {
  text: string | (() => string)
  label?: string
  showLabel?: boolean
  className?: string
}) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return (
    <button
      type="button"
      aria-label={done ? "Copied" : label}
      title={done ? "Copied" : label}
      onClick={() => {
        void navigator.clipboard.writeText(typeof text === "function" ? text() : text).then(() => {
          setDone(true)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => setDone(false), 1500)
        })
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus [&_svg]:size-4",
        showLabel ? "px-1.5 py-1 text-xs" : "size-7 justify-center",
        className
      )}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {showLabel && <span>{done ? "Copied" : label}</span>}
    </button>
  )
}
