"use client"

import { cn } from "cn"
import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { BlockCard } from "@/modules/builder/components/canvas/BlockCard"
import { DropSpot } from "@/modules/builder/components/canvas/DropSpot"
import { EndingSlot } from "@/modules/builder/components/canvas/EndingSlot"
import { WAY_MIN_WIDTH } from "@/modules/builder/components/canvas/layout"
import { StepCard } from "@/modules/builder/components/canvas/StepCard"
import { TapSpot } from "@/modules/builder/components/canvas/TapSpot"
import { useTestRunNodes } from "@/modules/builder/components/canvas/TestRunContext"
import { Linked, Wire } from "@/modules/builder/components/canvas/Wire"
import { KIND_META } from "@/modules/builder/data/blocks"
import { ifTitle } from "@/modules/builder/data/conditions"
import { canPlace, closes, isStep, lineCloses, resultsOf, stepsAt, type Block, type LinePath } from "@/modules/builder/data/draft"
import { placeKey, slotId, type Place } from "@/modules/builder/data/places"
import { useDrag } from "@/modules/builder/hooks/useDragDrop"

/** What every line of the canvas shares: the whole job, what is picked, and how to add. */
export type LineCtx = {
  /** The job's main line, which places and earlier steps are read against. */
  root: Block[]
  selected: string | null
  select: (id: string) => void
  /** Blocks to mark amber (missing details after a Save attempt, or an engine issue). */
  flagged: (id: string) => boolean
  desktop: boolean
  /** Phones: a + between blocks opens "Add a block" for that place. */
  onTap: (at: Place) => void
}

/**
 * A line of blocks (#164): a + between blocks, each block, and under an If its Yes and No side by
 * side, each a line of its own (that may hold more Ifs) with a slot to add the next block. A way
 * without End carries on after its If, so the line goes on below, centred.
 */
export function CanvasLine({ line, path, goesOn = false, ctx }: { line: Block[]; path: LinePath; goesOn?: boolean; ctx: LineCtx }) {
  const { name, self } = useBuilder()
  const { drag, startDrag, endDrag } = useDrag()
  const lit = useTestRunNodes()
  return line.map((blk, i) => {
    // When this If's ways run out the job goes on below it (a job saved with steps after an If).
    const waysGoOn = blk.kind === "if" && (i < line.length - 1 || goesOn)
    const joins = waysGoOn && blk.kind === "if" && !closes(blk)
    const at = { path, index: i }
    const before = stepsAt(ctx.root, path, i)
    const meta = KIND_META[blk.kind]
    return (
      <div key={blk.id} className="flex flex-col items-center">
        <Spot at={at} ctx={ctx} />
        <Linked nodeId={blk.id}>
          <div
            draggable={blk.kind !== "end"}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move"
              e.dataTransfer.setData("text/plain", blk.id)
              startDrag({ move: blk.id })
            }}
            onDragEnd={endDrag}
            className={cn(blk.kind !== "end" && "cursor-grab active:cursor-grabbing", drag && "move" in drag && drag.move === blk.id && "opacity-40")}
          >
            {isStep(blk) ? (
              <StepCard step={blk} results={resultsOf(before, self)} active={ctx.selected === blk.id} problem={ctx.flagged(blk.id)} onClick={() => ctx.select(blk.id)} />
            ) : (
              <BlockCard
                tone={meta.tone}
                icon={<meta.Icon />}
                kind={meta.title(name)}
                nodeId={blk.id}
                title={blk.kind === "if" ? ifTitle(blk, before) : "The job stops here"}
                active={ctx.selected === blk.id}
                warn={ctx.flagged(blk.id)}
                onClick={() => ctx.select(blk.id)}
              />
            )}
          </div>
        </Linked>
        {blk.kind === "if" && (
          // A flowchart fork (Ancung, 10 Nov: the ways looked unconnected): a stem down from the If,
          // a bar across to the middle of each way, then a line down to Yes and to No. Each way
          // draws its half of the bar, so it meets in the middle whatever the ways' widths.
          <div className="flex flex-col items-center">
            <Wire run={lit[blk.id] && { status: "ok" }} className="h-5" />
            <div className={cn("flex justify-center gap-6", joins ? "items-stretch" : "items-start")}>
              {(["then", "else"] as const).map((h) => {
                const wayPath: LinePath = [...path, { at: blk.id, h }]
                const way = blk[h]
                // The way that ran turns green from the If down to its first block.
                const ran = lit[blk.id]?.note === (h === "then" ? "Yes" : "No") ? ({ status: "ok" } as const) : undefined
                return (
                  <div key={h} className={`relative flex ${WAY_MIN_WIDTH} flex-col items-center`}>
                    <span aria-hidden className={cn("absolute top-0 h-px", ran ? "bg-success" : "bg-border-strong", h === "then" ? "right-[-12px] left-1/2" : "right-1/2 left-[-12px]")} />
                    <Wire run={ran} className="h-6" />
                    <span className="pb-1.5 text-xs font-medium text-muted-foreground">{h === "then" ? "Yes" : "No"}</span>
                    <CanvasLine line={way} path={wayPath} goesOn={waysGoOn} ctx={ctx} />
                    {/* The next block on this way; none after an If, which goes on in its own ways. */}
                    {!lineCloses(way) && way.at(-1)?.kind !== "if" && (
                      <>
                        {way.length > 0 && <span aria-hidden className="h-3 w-px bg-border-strong" />}
                        <EndingSlot
                          id={`slot-${blk.id}-${h}`}
                          at={{ path: wayPath, index: way.length }}
                          more={way.length > 0}
                          goesOn={waysGoOn}
                          active={ctx.selected === slotId(blk.id, h)}
                          onPick={() => ctx.select(slotId(blk.id, h))}
                        />
                      </>
                    )}
                    {/* The ways meet again before the blocks after the If: a line down from each way
                        that doesn't end, and a bar across, the fork above upside down. */}
                    {joins && !lineCloses(way) && (
                      <>
                        <span aria-hidden className="min-h-6 w-px flex-1 bg-border-strong" />
                        <span aria-hidden className={cn("absolute bottom-0 h-px bg-border-strong", h === "then" ? "right-[-12px] left-1/2" : "right-1/2 left-[-12px]")} />
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            {joins && <span aria-hidden className="h-5 w-px bg-border-strong" />}
          </div>
        )}
      </div>
    )
  })
}

/** Above each block: on phones a + to add there; while dragging, a drop spot where it may land. */
function Spot({ at, ctx }: { at: Place; ctx: LineCtx }) {
  const { self } = useBuilder()
  const { drag, accepts, dropAt } = useDrag()
  if (!ctx.desktop && !drag) return canPlace(ctx.root, at.path, at.index, "agent", self) ? <TapSpot key={`tap-${placeKey(at)}`} onClick={() => ctx.onTap(at)} /> : null
  return accepts(at) ? <DropSpot key={`spot-${placeKey(at)}`} id={`spot-${placeKey(at)}`} onDrop={() => dropAt(at)} label="Drop here" /> : null
}
