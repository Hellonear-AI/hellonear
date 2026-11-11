"use client"

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { KIND_META, PALETTE_KINDS, PALETTE_WHY_NOT, type Kind } from "@/modules/builder/data/blocks"
import { TONE, type Tone } from "@/modules/builder/data/tone"
import { useDrag } from "@/modules/builder/hooks/useDragDrop"

/**
 * The Blocks panel. It folds like the app's sidebar (AppShell): the width slides 240 <-> 72
 * (ease-in-out, 200 ms) and the full list crossfades with the icon rail. Phones and tablets always
 * get the full list on top.
 */
export function BlocksPanel({
  open,
  onToggle,
  desktop,
  canIf,
  ifWhy,
  canEnd,
  onAdd,
}: {
  open: boolean
  onToggle: () => void
  /** The fold only applies from lg (1024 px). */
  desktop: boolean
  /** Whether an If or End fits at the end of the main line, where a tap adds. */
  canIf: boolean
  /** Why the If can't go there, when it can't. */
  ifWhy: string
  canEnd: boolean
  /** A tap adds the block at the end of the main line. */
  onAdd: (kind: Kind) => void
}) {
  const list = (compact: boolean) => <PaletteList compact={compact} canIf={canIf} ifWhy={ifWhy} canEnd={canEnd} onAdd={onAdd} />
  return (
    <aside
      className={cn(
        "relative hidden shrink-0 border-border lg:block lg:overflow-hidden lg:border-r lg:transition-[width] lg:duration-200 lg:ease-in-out motion-reduce:transition-none",
        open ? "lg:w-60" : "lg:w-[72px]"
      )}
    >
      <div
        inert={desktop && !open}
        className={cn(
          "flex flex-col gap-2 p-4 lg:absolute lg:inset-y-0 lg:left-0 lg:w-60 lg:overflow-x-hidden lg:overflow-y-auto lg:transition-opacity lg:duration-150 lg:ease-out motion-reduce:transition-none",
          open ? "lg:opacity-100 lg:delay-50" : "lg:opacity-0"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">Blocks</h2>
          <Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" aria-label="Fold the Blocks panel ([)" title="Fold ([)" onClick={onToggle}>
            <PanelLeftCloseIcon />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Drag one onto the canvas, or tap to add it at the end.</p>
        {list(false)}
      </div>
      <div
        inert={!desktop || open}
        className={cn(
          "absolute inset-y-0 left-0 hidden w-[72px] flex-col items-center gap-2 overflow-x-hidden overflow-y-auto px-3 py-4 transition-opacity duration-150 ease-out motion-reduce:transition-none lg:flex",
          open ? "opacity-0" : "opacity-100 delay-50"
        )}
      >
        <Button variant="ghost" size="icon-sm" aria-label="Open the Blocks panel ([)" title="Open ([)" onClick={onToggle}>
          <PanelLeftOpenIcon />
        </Button>
        {list(true)}
      </div>
    </aside>
  )
}

/** Start (every job has one), then each block to tap or drag onto the canvas. */
function PaletteList({ compact, canIf, ifWhy, canEnd, onAdd }: { compact: boolean; canIf: boolean; ifWhy: string; canEnd: boolean; onAdd: (kind: Kind) => void }) {
  const { name } = useBuilder()
  const { startDrag, endDrag } = useDrag()
  const fits: Partial<Record<Kind, boolean>> = { if: canIf, end: canEnd }
  return PALETTE_KINDS.map((kind) => {
    const { tone, Icon, title, line } = KIND_META[kind]
    if (kind === "start") return <PaletteItem key={kind} compact={compact} tone={tone} icon={<Icon />} title={title(name)} line={line(name)} disabled />
    return (
      <PaletteItem
        key={kind}
        compact={compact}
        tone={tone}
        icon={<Icon />}
        title={title(name)}
        line={fits[kind] === false ? (kind === "if" ? ifWhy : (PALETTE_WHY_NOT[kind] ?? line(name))) : line(name)}
        onClick={() => onAdd(kind)}
        onDragStart={() => startDrag({ add: kind })}
        onDragEnd={endDrag}
      />
    )
  })
}

function PaletteItem({
  icon,
  title,
  line,
  onClick,
  disabled,
  onDragStart,
  onDragEnd,
  compact,
  tone,
}: {
  tone: Tone
  icon: ReactNode
  title: string
  line: string
  onClick?: () => void
  disabled?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  /** The folded panel: the icon only, its name in a tooltip (desktop). */
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      draggable={Boolean(onDragStart) && !disabled}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy"
        e.dataTransfer.setData("text/plain", title)
        onDragStart?.()
      }}
      onDragEnd={onDragEnd}
      aria-label={compact ? `${title}: ${line}` : undefined}
      title={compact ? `${title}: ${line}` : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md bg-muted px-3 py-2.5 text-left outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60",
        compact && "justify-center p-2"
      )}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-sm [&>svg]:size-4", TONE[tone])}>{icon}</span>
      <span className={cn("flex min-w-0 flex-col", compact && "hidden")}>
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{line}</span>
      </span>
    </button>
  )
}
