"use client"

import { PlusIcon } from "lucide-react"
import { cn } from "cn"
import { CARD_WIDTH } from "@/modules/builder/components/canvas/layout"
import { useDropTarget } from "@/modules/builder/hooks/useDragDrop"

/**
 * A place between two steps where a dragged block may go (B1.7): a slim dashed line with a small +,
 * bright while hovered. Its hit area is taller than it looks so it's easy to land on. Only shown
 * where the drag may land.
 */
export function DropSpot({ id, onDrop, label }: { id: string; onDrop: () => void; label: string }) {
  const { hot, handlers } = useDropTarget(id, true, onDrop)
  return (
    <div className={`flex ${CARD_WIDTH} max-w-full flex-col items-center`}>
      <div aria-label={label} {...handlers} className="flex h-7 w-full items-center gap-2">
        <span className={cn("h-0.5 flex-1 rounded-full border-t-2 border-dashed transition-colors duration-100 ease-out", hot ? "border-foreground" : "border-border-strong")} />
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-100 ease-out",
            hot ? "bg-surface-hover text-foreground ring-2 ring-foreground" : "bg-surface text-muted-foreground ring-1 ring-border-strong"
          )}
        >
          <PlusIcon className="size-3" />
        </span>
        <span className={cn("h-0.5 flex-1 rounded-full border-t-2 border-dashed transition-colors duration-100 ease-out", hot ? "border-foreground" : "border-border-strong")} />
      </div>
    </div>
  )
}
