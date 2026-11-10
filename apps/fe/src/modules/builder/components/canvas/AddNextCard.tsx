"use client"

import { PlusIcon } from "lucide-react"
import { cn } from "cn"
import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { CARD_MAX_WIDTH } from "@/modules/builder/components/canvas/layout"
import type { Place } from "@/modules/builder/data/places"
import { useDrag, useDropTarget } from "@/modules/builder/hooks/useDragDrop"

/**
 * The end of the main line, unless the path already ends: a tap adds the next step (on phones it
 * opens "Add a block"), and it is also where a dragged block lands (Ancung, 9 Nov).
 */
export function AddNextCard({ at, desktop, onClick }: { at: Place; desktop: boolean; onClick: () => void }) {
  const { name } = useBuilder()
  const { drag, accepts: canDrop, dropAt } = useDrag()
  const accepts = canDrop(at)
  const { hot, handlers } = useDropTarget("end", accepts, () => dropAt(at))
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className={cn(
        `flex w-full ${CARD_MAX_WIDTH} flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-3 text-center outline-none transition-colors duration-100 ease-out focus-visible:ring-2 focus-visible:ring-focus`,
        hot ? "border-solid border-foreground bg-surface-hover ring-4 ring-foreground/10" : drag && accepts ? "border-foreground/60 bg-surface" : "border-border-strong bg-surface/60 hover:bg-surface"
      )}
    >
      <PlusIcon className={cn("size-4", hot ? "text-foreground" : "text-muted-foreground")} />
      <span className="text-sm font-medium text-foreground">{drag && accepts ? "Drop to add it here" : "Add the next step"}</span>
      <span className="text-xs text-muted-foreground">{desktop ? `Ask ${name} to do something` : "Tap to pick a block"}</span>
    </button>
  )
}
