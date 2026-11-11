"use client"

import { PlusIcon, SquareIcon } from "lucide-react"
import { cn } from "cn"
import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { PanelHead } from "@/modules/builder/components/panels/PanelHead"
import { ADD_KINDS, KIND_META, WHY_NOT, type Kind } from "@/modules/builder/data/blocks"
import { TONE } from "@/modules/builder/data/tone"

/** A way's "Add a step" panel: the blocks that can go on that way, If and End only where they fit. */
export function EndingPanel({
  which,
  more = false,
  goesOn = false,
  canIf,
  ifWhy,
  canEnd,
  onPick,
}: {
  which: "then" | "else"
  /** The way already has steps: this adds one more after them. */
  more?: boolean
  /** Blocks follow its If, so an empty way carries on to them instead of stopping. */
  goesOn?: boolean
  canIf: boolean
  /** Why the If can't go on this way, when it can't. */
  ifWhy: string
  canEnd: boolean
  onPick: (kind: Kind) => void
}) {
  const { name } = useBuilder()
  const off = (kind: Kind) => (kind === "if" && !canIf ? ifWhy : kind === "end" && !canEnd ? WHY_NOT[kind] : undefined)
  return (
    <>
      <PanelHead icon={<SquareIcon />} title={which === "then" ? "If yes" : "If no"} />
      <p className="text-sm text-muted-foreground">
        {more
          ? "Add the next step on this way. It can use what came before it on this path."
          : goesOn
            ? "Nothing runs here yet, so this way carries on after the If. Add a block, or drag one onto it."
            : "Nothing runs here yet, so the job stops on this way. Add a block, or drag one onto it."}
      </p>
      <div className="flex flex-col gap-2">
        {ADD_KINDS.map((kind) => {
          const { tone, Icon, title } = KIND_META[kind]
          const why = off(kind)
          return (
            <button
              key={kind}
              type="button"
              disabled={Boolean(why)}
              onClick={() => onPick(kind)}
              className="flex items-center gap-3 rounded-md bg-muted px-3 py-2.5 text-left outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
            >
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-sm [&>svg]:size-4", TONE[tone])}>
                <Icon />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-foreground">{title(name)}</span>
                {why && <span className="text-xs text-muted-foreground">{why}</span>}
              </span>
              {!why && <PlusIcon className="size-4 shrink-0 text-muted-foreground" />}
            </button>
          )
        })}
      </div>
    </>
  )
}
