"use client"

import { PlusIcon } from "lucide-react"
import { cn } from "cn"
import { CARD_WIDTH } from "@/modules/builder/components/canvas/layout"
import type { Place } from "@/modules/builder/data/places"
import { useDrag, useDropTarget } from "@/modules/builder/hooks/useDragDrop"

/** An empty way of the If: tap to pick a block, or drop one on it. Empty, the path stops there. */
export function EndingSlot({
  id,
  at,
  more = false,
  goesOn = false,
  active,
  onPick,
}: {
  id: string
  /** Where a block dropped on it goes: the end of its way. */
  at: Place
  /** The way already has steps: a smaller slot that adds one more. */
  more?: boolean
  /** Blocks follow its If, so empty it carries on to them instead of stopping. */
  goesOn?: boolean
  active: boolean
  onPick: () => void
}) {
  const { accepts: canDrop, dropAt } = useDrag()
  const accepts = canDrop(at)
  const { hot, handlers } = useDropTarget(id, accepts, () => dropAt(at))
  return (
    <button
      type="button"
      onClick={onPick}
      {...handlers}
      aria-pressed={active}
      className={cn(
        `flex ${CARD_WIDTH} max-w-full flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-3 text-center outline-none transition-[background-color,border-color,box-shadow] duration-100 ease-out focus-visible:ring-2 focus-visible:ring-focus`,
        hot
          ? "border-solid border-foreground bg-surface-hover ring-4 ring-foreground/10"
          : accepts
            ? "border-foreground/60 bg-surface"
            : active
              ? "border-foreground bg-surface ring-2 ring-foreground ring-offset-2 ring-offset-background"
              : "border-border-strong bg-surface/60 hover:bg-surface"
      )}
    >
      <PlusIcon className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium text-foreground">{accepts ? "Drop to add it here" : more ? "Add the next step" : "Add a step"}</span>
      {!more && <span className="text-xs text-muted-foreground">{goesOn ? "Empty: carries on after the If" : "Empty: the job stops here"}</span>}
    </button>
  )
}
