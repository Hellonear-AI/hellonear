"use client"

import { KeyboardIcon, MinusIcon, PlusIcon, ScanIcon } from "lucide-react"
import type { Ref } from "react"
import { Button } from "@/components/ui/button"
import { ZOOM_STEP } from "@/modules/builder/hooks/useCanvasView"

/** Zoom controls (n8n's, bottom left): out, the level (click for 100%), in, fit, shortcuts. */
export function ZoomControls({
  zoomLabelRef,
  zoomBy,
  reset,
  fit,
  onHelp,
}: {
  /** The level's label, written by useCanvasView once per frame. */
  zoomLabelRef: Ref<HTMLSpanElement>
  zoomBy: (factor: number) => void
  reset: () => void
  fit: () => void
  onHelp: () => void
}) {
  return (
    <div className="absolute top-3 right-3 flex flex-col-reverse items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-xs lg:top-auto lg:right-auto lg:bottom-4 lg:left-4 lg:flex-row">
      <Button variant="ghost" size="icon-sm" className="lg:order-last" aria-label="Fit the job on screen (1)" title="Fit (1)" onClick={fit}>
        <ScanIcon />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Zoom out (-)" title="Zoom out (-)" onClick={() => zoomBy(1 / ZOOM_STEP)}>
        <MinusIcon />
      </Button>
      <button
        type="button"
        onClick={() => reset()}
        title="Back to 100% (0)"
        className="hidden min-w-12 lg:block rounded-full px-1.5 py-1 text-center text-xs font-medium text-foreground tabular-nums outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span ref={zoomLabelRef}>100%</span>
      </button>
      <Button variant="ghost" size="icon-sm" aria-label="Zoom in (+)" title="Zoom in (+)" onClick={() => zoomBy(ZOOM_STEP)}>
        <PlusIcon />
      </Button>
      <span aria-hidden className="mx-0.5 hidden h-4 w-px bg-border lg:order-last lg:block" />
      <Button variant="ghost" size="icon-sm" className="hidden lg:order-last lg:inline-flex" aria-label="Keyboard shortcuts (?)" title="Keyboard shortcuts (?)" onClick={onHelp}>
        <KeyboardIcon />
      </Button>
    </div>
  )
}
