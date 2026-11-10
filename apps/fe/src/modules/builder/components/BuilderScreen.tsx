"use client"

import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { mindHref } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { MEDIA } from "@/lib/media"
import { browserTimeZone } from "@/lib/stream"
import { useWorkflow } from "@/modules/autopilot/hooks/useAutopilot"
import { AddBlockSheet } from "@/modules/builder/components/AddBlockSheet"
import { BuilderContext } from "@/modules/builder/components/BuilderContext"
import { BuilderHeader } from "@/modules/builder/components/BuilderHeader"
import { Canvas } from "@/modules/builder/components/canvas/Canvas"
import { TestRunContext } from "@/modules/builder/components/canvas/TestRunContext"
import { LeaveDialog } from "@/modules/builder/components/LeaveDialog"
import { BlocksPanel } from "@/modules/builder/components/Palette"
import { BlockSettings } from "@/modules/builder/components/panels/BlockSettings"
import { SettingsFrame } from "@/modules/builder/components/panels/SettingsFrame"
import { PhoneBar } from "@/modules/builder/components/PhoneBar"
import { ShortcutsDialog } from "@/modules/builder/components/ShortcutsDialog"
import { SaveProblems, TestRunResult } from "@/modules/builder/components/StatusBanners"
import { newBlock, type Kind } from "@/modules/builder/data/blocks"
import { canPlace, emptyDraft, findBlock, fromCanvas, insertBlock, removeBlock, updateBlock, type Block, type Draft } from "@/modules/builder/data/draft"
import { mainEnd as mainEndOf, START, takesMore, type Place } from "@/modules/builder/data/places"
import { useCanvasView, ZOOM_STEP } from "@/modules/builder/hooks/useCanvasView"
import { DragContext, useDragDrop } from "@/modules/builder/hooks/useDragDrop"
import { useEditorShortcuts } from "@/modules/builder/hooks/useEditorShortcuts"
import { useHistory } from "@/modules/builder/hooks/useHistory"
import { useLeaveGuard } from "@/modules/builder/hooks/useLeaveGuard"
import { usePaletteFold } from "@/modules/builder/hooks/usePaletteFold"
import { useSave } from "@/modules/builder/hooks/useSave"
import { useSelection } from "@/modules/builder/hooks/useSelection"
import { useTestRun } from "@/modules/builder/hooks/useTestRun"
import { useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"

const ZONE = () => browserTimeZone() ?? "UTC"

/**
 * Builder (design "7 · Automations" B1.0, B1.1, B1.6; #20). Stage 2 (9 Nov, with Ancung): Start,
 * then "Ask {Mind}" and tool steps in a line, then at most one If with a yes and a no ending, set
 * from the panel on the right and saved as the engine's canvas. Test run, websites and dragging
 * come next. Opens from Autopilot (New job, Edit steps).
 */
export function BuilderScreen({ mindId, workflowId }: { mindId: string; workflowId: string | null }) {
  const existing = useWorkflow(mindId, workflowId)
  if (workflowId && existing.isPending) return <Skeleton className="m-6 h-[480px] rounded-lg" />
  if (workflowId && !existing.data) return <Gone mindId={mindId} text="This job could not be loaded." />
  const draft = existing.data ? fromCanvas(existing.data.canvas, ZONE()) : emptyDraft(ZONE())
  if (!draft) return <Gone mindId={mindId} text="This job has blocks the Builder can't show yet (like a website call). It still runs; you can run it from Autopilot." />
  return <Editor key={workflowId ?? "new"} mindId={mindId} workflowId={workflowId} initial={draft} />
}

function Gone({ mindId, text }: { mindId: string; text: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-3 p-6">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button variant="outline" nativeButton={false} render={<Link href={mindHref(mindId, "autopilot")} />}>
        <ArrowLeftIcon />
        Back to Autopilot
      </Button>
    </div>
  )
}

/** The Builder itself: the draft, and the hooks and parts that work on it. */
function Editor({ mindId, workflowId, initial }: { mindId: string; workflowId: string | null; initial: Draft }) {
  const name = useMind(mindId).data?.name ?? "Your Mind"
  const address = useMindWallet(mindId).data?.address ?? ""
  // Names the Mind's own wallet in results ("Balance of Omaga") instead of its long address.
  const self = useMemo(() => ({ name, address }), [name, address])
  const builder = useMemo(() => ({ mindId, name, address, self }), [mindId, name, address, self])
  const [draft, setDraft] = useState<Draft>(initial)
  const { selected, select, picked, slot, pickNext, toggle: toggleSettings } = useSelection(draft.line)
  const { frame, content, zoomLabel, space, panning, reset, fit, zoomBy, onPointerDown, onPointerMove, endPan } = useCanvasView()
  const [helpOpen, setHelpOpen] = useState(false)
  // Phones (B1.8): a + between blocks opens "Add a block" for that place.
  const [sheetAt, setSheetAt] = useState<Place | null>(null)
  // The fold only applies from lg (1024 px); below that the list sits on top, always open.
  const desktop = useMediaQuery(MEDIA.lg, true)
  const fold = usePaletteFold()
  const history = useHistory(draft, setDraft)
  const { test, running, runTest, clear: clearTest, lit } = useTestRun(mindId, workflowId, draft.line)
  const nameField = useRef<HTMLInputElement>(null)
  const saver = useSave({ mindId, workflowId, draft, initial, focusName: () => nameField.current?.focus(), select })
  const { save, saving, canSave, dirty, problems, flagged } = saver
  // Unsaved changes ask before you leave: the back arrow, the browser's Back, closing the tab.
  const guard = useLeaveGuard(dirty, mindHref(mindId, "autopilot"))

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setBlock = (id: string, patch: Partial<Block>) => setDraft((d) => ({ ...d, line: updateBlock(d.line, id, patch) }))
  const mainEnd = mainEndOf(draft.line)

  /** A new block of `kind` at a place, picked so its settings open. */
  function addAt(kind: Kind, at: Place) {
    const blk = newBlock(kind, draft.line, at, self, address)
    setDraft((d) => ({ ...d, line: insertBlock(d.line, at.path, at.index, blk) }))
    select(blk.id)
  }
  /** A tap in the palette adds at the end of the main line. */
  function addStep(kind: Kind) {
    if (canPlace(draft.line, mainEnd.path, mainEnd.index, kind, self)) addAt(kind, mainEnd)
    else toast(kind === "if" ? "Add a check or a website before an If." : "The job's main line already ends. Drag the block to where it should go.")
  }
  function removeStep(id: string) {
    setDraft((d) => ({ ...d, line: removeBlock(d.line, id) }))
    select(START)
  }

  const dnd = useDragDrop({ line: draft.line, setDraft, self, onAdd: addAt })
  const testDisabled = running || dirty || saving
  const runSaved = () => void runTest()
  const saveNow = () => void save()

  useEditorShortcuts({
    save: () => {
      if (canSave) saveNow()
    },
    testRun: () => {
      if (workflowId && !dirty && !running) runSaved()
    },
    undo: history.undo,
    redo: history.redo,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    resetZoom: reset,
    fit,
    togglePalette: fold.toggle,
    toggleSettings,
    help: () => setHelpOpen(true),
    closeSettings: () => select(null),
    deleteBlock: () => {
      if (!selected || selected === START) return
      if (findBlock(draft.line, selected)) removeStep(selected)
    },
    pick: pickNext,
  })

  return (
    <BuilderContext value={builder}>
      <DragContext value={dnd}>
        <div className="flex h-dvh min-w-0 flex-col overflow-hidden bg-background">
          <BuilderHeader
            nameRef={nameField}
            name={draft.name}
            onNameChange={(n) => set({ name: n })}
            dirty={dirty}
            saved={Boolean(workflowId)}
            onBack={() => guard.leave(mindHref(mindId, "autopilot"))}
            running={running}
            testDisabled={testDisabled}
            onTest={runSaved}
            saving={saving}
            saveDisabled={!canSave}
            onSave={saveNow}
          />
          <SaveProblems error={saver.saveError} issues={saver.engineIssues} />
          <TestRunResult test={test} onClear={clearTest} />
          {dirty && workflowId && <p className="mx-4 mt-3 text-xs text-muted-foreground md:mx-6">Save your changes to test them.</p>}

          <TestRunContext value={lit}>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
              <BlocksPanel
                open={fold.open}
                onToggle={fold.toggle}
                desktop={desktop}
                canIf={canPlace(draft.line, mainEnd.path, mainEnd.index, "if", self)}
                canEnd={canPlace(draft.line, mainEnd.path, mainEnd.index, "end", self)}
                onAdd={addStep}
              />
              <Canvas
                frameRef={frame}
                contentRef={content}
                zoomLabelRef={zoomLabel}
                pan={{ space, panning, onPointerDown, onPointerMove, endPan }}
                zoom={{ zoomBy, reset, fit }}
                draft={draft}
                ctx={{ root: draft.line, selected, select, flagged, desktop, onTap: setSheetAt }}
                onAddNext={() => (desktop ? addStep("agent") : setSheetAt(mainEnd))}
                onEmptyClick={() => select(null)}
                onHelp={() => setHelpOpen(true)}
              />
              {selected && (
                <SettingsFrame desktop={desktop} onClose={() => select(null)}>
                  <BlockSettings
                    draft={draft}
                    picked={picked}
                    slot={slot}
                    issues={saver.issuesAt(selected)}
                    missingSkills={saver.missingSkills}
                    missingSkillFor={saver.missingSkillFor}
                    set={set}
                    onPatch={setBlock}
                    onRemove={removeStep}
                    onAdd={addAt}
                  />
                </SettingsFrame>
              )}
            </div>

            <PhoneBar
              canAdd={takesMore(draft.line)}
              onAdd={() => setSheetAt(mainEnd)}
              running={running}
              testDisabled={!workflowId || testDisabled}
              onTest={runSaved}
              saving={saving}
              saveDisabled={!canSave}
              onSave={saveNow}
            />
            <AddBlockSheet
              at={sheetAt}
              line={draft.line}
              onClose={() => setSheetAt(null)}
              onPick={(kind) => {
                const at = sheetAt ?? mainEnd
                setSheetAt(null)
                addAt(kind, at)
              }}
            />
          </TestRunContext>
          <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
          <LeaveDialog open={guard.asking} blocked={problems.length > 0} saving={saving} onStay={guard.stay} onDiscard={guard.discard} onSave={saveNow} />
        </div>
      </DragContext>
    </BuilderContext>
  )
}
