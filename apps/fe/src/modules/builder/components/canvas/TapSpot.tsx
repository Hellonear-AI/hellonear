import { PlusIcon } from "lucide-react"
import { CARD_WIDTH } from "@/modules/builder/components/canvas/layout"

/** The + between two blocks on phones (B1.8): tap it to add a block there. */
export function TapSpot({ onClick }: { onClick: () => void }) {
  return (
    <div className={`flex ${CARD_WIDTH} max-w-full flex-col items-center`}>
      <span aria-hidden className="h-2 w-px bg-border-strong" />
      <button
        type="button"
        onClick={onClick}
        aria-label="Add a block here"
        className="flex size-7 items-center justify-center rounded-full bg-surface text-foreground ring-1 ring-border-strong outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
      >
        <PlusIcon className="size-3.5" />
      </button>
    </div>
  )
}
