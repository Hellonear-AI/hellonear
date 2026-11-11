"use client"

import { PlusIcon } from "lucide-react"
import { cn } from "cn"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { ADD_KINDS, KIND_META, WHY_NOT, type Kind } from "@/modules/builder/data/blocks"
import { canPlace, lineAt, type Block } from "@/modules/builder/data/draft"
import type { Place } from "@/modules/builder/data/places"
import { TONE } from "@/modules/builder/data/tone"
import { toolInfo } from "@/modules/builder/data/tools"

/** "Add a block" on phones (B1.8): only the blocks that fit at that place. */
export function AddBlockSheet({ at, line, onClose, onPick }: { at: Place | null; line: Block[]; onClose: () => void; onPick: (kind: Kind) => void }) {
  const { name, self } = useBuilder()
  const place = at ?? { path: [], index: line.length }
  const here = lineAt(line, place.path)
  const label = (x: Block) => (x.kind === "agent" ? `Ask ${name}` : x.kind === "tool" ? (toolInfo(x.tool)?.title ?? "a tool") : x.kind === "http" ? "Call a website" : x.kind === "if" ? "the If" : "End")
  const where = `${place.index === 0 ? (place.path.length ? "At the start of this way" : "After Start") : `After ${label(here[place.index - 1])}`}${place.index < here.length ? `, before ${label(here[place.index])}` : ""}`
  const off = (kind: Kind) => (canPlace(line, place.path, place.index, kind, self) ? null : WHY_NOT[kind])
  return (
    // A drawer from the bottom you can swipe away, like the live view on phones (Ancung, 10 Nov).
    <Drawer open={at !== null} onOpenChange={(open) => !open && onClose()} showSwipeHandle>
      <DrawerContent className="gap-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* A margin, not the drawer's gap: its children sit in an inner element without one. */}
        <DrawerHeader className="mb-4 gap-1.5 px-5 py-0 text-left group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle>Add a block</DrawerTitle>
          <DrawerDescription>{where}</DrawerDescription>
        </DrawerHeader>
        {/* Side padding inside the drawer's clipped content, not on its outer popup (it cut letters). */}
        <ul className="flex flex-col gap-2 overflow-y-auto px-5">
          {ADD_KINDS.map((kind) => {
            const { tone, Icon, title, long } = KIND_META[kind]
            const why = off(kind)
            return (
              <li key={kind}>
                <button
                  type="button"
                  disabled={Boolean(why)}
                  onClick={() => onPick(kind)}
                  className="flex w-full items-center gap-3 rounded-md bg-muted px-3 py-2.5 text-left outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-sm [&>svg]:size-4", TONE[tone])}>
                    <Icon />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-foreground">{title(name)}</span>
                    <span className="text-xs text-muted-foreground">{why ?? long(name)}</span>
                  </span>
                  {!why && <PlusIcon className="size-4 shrink-0 text-muted-foreground" />}
                </button>
              </li>
            )
          })}
        </ul>
      </DrawerContent>
    </Drawer>
  )
}
