"use client"

import { cn } from "cn"
import { scheduleText, zoneName } from "@/modules/autopilot/data/schedule"
import { AddNextCard } from "@/modules/builder/components/canvas/AddNextCard"
import { BlockCard } from "@/modules/builder/components/canvas/BlockCard"
import { CanvasLine, type LineCtx } from "@/modules/builder/components/canvas/CanvasLine"
import { Linked } from "@/modules/builder/components/canvas/Wire"
import { ZoomControls } from "@/modules/builder/components/canvas/ZoomControls"
import { KIND_META } from "@/modules/builder/data/blocks"
import { cronOf, type Draft } from "@/modules/builder/data/draft"
import { mainEnd, START, takesMore } from "@/modules/builder/data/places"
import type { useCanvasView } from "@/modules/builder/hooks/useCanvasView"
import { useDrag } from "@/modules/builder/hooks/useDragDrop"

type CanvasView = ReturnType<typeof useCanvasView>

/**
 * The canvas (like n8n's): Start, the job's blocks and the Add card in a frame that pans and zooms
 * (useCanvasView), with the zoom controls over it.
 */
export function Canvas({
  frameRef,
  contentRef,
  zoomLabelRef,
  pan,
  zoom,
  draft,
  ctx,
  onAddNext,
  onEmptyClick,
  onHelp,
}: {
  /** The frame, the moving content and the zoom label, which useCanvasView writes to directly. */
  frameRef: CanvasView["frame"]
  contentRef: CanvasView["content"]
  zoomLabelRef: CanvasView["zoomLabel"]
  pan: Pick<CanvasView, "space" | "panning" | "onPointerDown" | "onPointerMove" | "endPan">
  zoom: Pick<CanvasView, "zoomBy" | "reset" | "fit">
  draft: Draft
  ctx: LineCtx
  /** The Add card at the end of the main line was tapped. */
  onAddNext: () => void
  /** A click on empty canvas (it closes the settings panel, as in n8n). */
  onEmptyClick: () => void
  onHelp: () => void
}) {
  const { drag } = useDrag()
  const start = KIND_META.start
  return (
    <main
      ref={frameRef}
      aria-label="Job steps"
      onDragOver={(e) => drag && e.preventDefault()}
      onPointerDown={pan.onPointerDown}
      onPointerMove={pan.onPointerMove}
      onPointerUp={(e) => {
        const moved = pan.endPan(e)
        // A click on empty canvas closes the settings panel, as in n8n.
        if (!moved && e.button === 0 && !pan.space && e.target instanceof Element && !e.target.closest("button, a, input, textarea, [draggable='true']")) onEmptyClick()
      }}
      onPointerCancel={pan.endPan}
      // Dots that fade a little when zoomed out (--dot-opacity, set with the grid in useCanvasView).
      style={{ backgroundImage: "radial-gradient(color-mix(in oklab, var(--color-border) calc(var(--dot-opacity, 1) * 100%), transparent) 1px, transparent 1px)" }}
      className={cn(
        "relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden select-none",
        pan.panning ? "cursor-grabbing" : pan.space ? "cursor-grab" : "cursor-default"
      )}
    >
      <div
        ref={contentRef}
        className={cn("absolute top-0 left-0 flex w-max min-w-[640px] origin-top-left flex-col items-center pb-24 will-change-transform", pan.space && "pointer-events-none")}
      >
        <BlockCard
          tone={start.tone}
          icon={<start.Icon />}
          kind="Start"
          title={scheduleText(cronOf(draft))}
          line={`${zoneName(draft.timezone)} time`}
          active={ctx.selected === START}
          onClick={() => ctx.select(START)}
        />
        <CanvasLine line={draft.line} path={[]} ctx={ctx} />
        {/* The end of the main line is this card, unless the path already ends; it is also where a
            dragged block lands (Ancung, 9 Nov). */}
        {takesMore(draft.line) && (
          <Linked>
            <AddNextCard at={mainEnd(draft.line)} desktop={ctx.desktop} onClick={onAddNext} />
          </Linked>
        )}
      </div>

      <ZoomControls zoomLabelRef={zoomLabelRef} zoomBy={zoom.zoomBy} reset={zoom.reset} fit={zoom.fit} onHelp={onHelp} />
    </main>
  )
}
