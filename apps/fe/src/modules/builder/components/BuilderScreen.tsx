"use client"

import {
  ArrowLeftIcon,
  BotIcon,
  CalendarClockIcon,
  CheckIcon,
  CircleXIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  GlobeIcon,
  OctagonXIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { cn } from "cn"
import { Spinner } from "@/components/elements/Spinner"
import { mindHref } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Skeleton } from "@/components/ui/skeleton"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { MEDIA } from "@/lib/media"
import { browserTimeZone } from "@/lib/stream"
import { useWorkflow } from "@/modules/autopilot/hooks/useAutopilot"
import { BuilderContext } from "@/modules/builder/components/BuilderContext"
import { Canvas } from "@/modules/builder/components/canvas/Canvas"
import { TestRunContext } from "@/modules/builder/components/canvas/TestRunContext"
import { BlockSettings } from "@/modules/builder/components/panels/BlockSettings"
import { SettingsFrame } from "@/modules/builder/components/panels/SettingsFrame"
import { newBlock, type Kind } from "@/modules/builder/data/blocks"
import {
  canPlace,
  emptyDraft,
  findBlock,
  fromCanvas,
  insertBlock,
  lineAt,
  lineCloses,
  NAME_MAX,
  removeBlock,
  updateBlock,
  type Block,
  type Draft,
  type Self,
} from "@/modules/builder/data/draft"
import { mainEnd as mainEndOf, START, type Place } from "@/modules/builder/data/places"
import { wentWrong } from "@/modules/builder/data/testRun"
import { TONE, type Tone } from "@/modules/builder/data/tone"
import { toolInfo } from "@/modules/builder/data/tools"
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
  const { save, saving, dirty, problems, flagged } = saver
  // Unsaved changes ask before you leave: the back arrow, the browser's Back, closing the tab.
  const guard = useLeaveGuard(dirty, mindHref(mindId, "autopilot"))

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setBlock = (id: string, patch: Partial<Block>) => setDraft((d) => ({ ...d, line: updateBlock(d.line, id, patch) }))
  const mainEnd = mainEndOf(draft.line)

  /** A new block of `kind` at a place. */
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
  const addIf = () => addStep("if")
  function removeStep(id: string) {
    setDraft((d) => ({ ...d, line: removeBlock(d.line, id) }))
    select(START)
  }

  const dnd = useDragDrop({ line: draft.line, setDraft, self, onAdd: addAt })
  const { startDrag, endDrag } = dnd
  const canIf = canPlace(draft.line, mainEnd.path, mainEnd.index, "if", self)
  const canEnd = canPlace(draft.line, mainEnd.path, mainEnd.index, "end", self)

  const palette = (compact: boolean) => (
    <>
      <PaletteItem compact={compact} tone="start" icon={<CalendarClockIcon />} title="Start" line="Every job has one" disabled />
      <PaletteItem
        compact={compact}
        tone="agent"
        icon={<BotIcon />}
        title={`Ask ${name}`}
        line={`${name} writes or decides`}
        onClick={() => addStep("agent")}
        onDragStart={() => startDrag({ add: "agent" })}
        onDragEnd={endDrag}
      />
      <PaletteItem
        compact={compact}
        tone="tool"
        icon={<SearchIcon />}
        title="Use a tool"
        line="An account, the time, the calendar, the inbox"
        onClick={() => addStep("tool")}
        onDragStart={() => startDrag({ add: "tool" })}
        onDragEnd={endDrag}
      />
      <PaletteItem
        compact={compact}
        tone="if"
        icon={<GitBranchIcon />}
        title="If or else"
        line={canIf ? "Choose one of two ways" : "Add a check or a website first"}
        onClick={addIf}
        onDragStart={() => startDrag({ add: "if" })}
        onDragEnd={endDrag}
      />
      <PaletteItem
        compact={compact}
        tone="http"
        icon={<GlobeIcon />}
        title="Call a website"
        line="Send to your own service"
        onClick={() => addStep("http")}
        onDragStart={() => startDrag({ add: "http" })}
        onDragEnd={endDrag}
      />
      {/* End (#164): the path stops where you put it. */}
      <PaletteItem
        compact={compact}
        tone="start"
        icon={<OctagonXIcon />}
        title="End"
        line={canEnd ? "Stop the job here" : "Goes at the end of a path"}
        onClick={() => addStep("end")}
        onDragStart={() => startDrag({ add: "end" })}
        onDragEnd={endDrag}
      />
    </>
  )

  useEditorShortcuts({
    save: () => {
      if (saver.canSave) void save()
    },
    testRun: () => {
      if (workflowId && !dirty && !running) void runTest()
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
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <Button variant="ghost" size="icon" aria-label="Back to Autopilot" onClick={() => guard.leave(mindHref(mindId, "autopilot"))}>
          <ArrowLeftIcon />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The job's name, edited right here (n8n does the same); the Start panel shows the same field. */}
          <input
            ref={nameField}
            aria-label="Job name"
            value={draft.name}
            maxLength={NAME_MAX}
            placeholder="Untitled job"
            onChange={(e) => set({ name: e.target.value })}
            className="-mx-1.5 w-full max-w-md truncate rounded-sm bg-transparent px-1.5 text-[15px] font-semibold text-foreground outline-none placeholder:text-foreground hover:bg-muted focus:bg-muted focus:placeholder:text-tertiary-foreground"
          />
          <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : !workflowId ? "Not saved yet" : "All changes saved"}</span>
        </div>
        {workflowId && (
          <Button
            variant="outline"
            className="hidden lg:inline-flex"
            onClick={() => void runTest()}
            disabled={running || dirty || saving}
            title={dirty ? "Save your changes to test them" : "Runs the saved job once"}
          >
            {running ? <Spinner /> : <FlaskConicalIcon />}
            {running ? "Testing" : "Test run"}
          </Button>
        )}
        <Button className="hidden lg:inline-flex" onClick={() => void save()} disabled={saving || (Boolean(workflowId) && !dirty)}>
          {saving && <Spinner />}
          Save
        </Button>
      </header>

      {(saver.engineIssues.length > 0 || saver.saveError) && (
        <div role="alert" className="mx-4 mt-4 flex items-start gap-2.5 rounded-md bg-danger-soft px-3.5 py-3 text-sm text-foreground md:mx-6">
          <CircleXIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="flex flex-col gap-1">
            {saver.saveError ?? "The job was not saved. Fix the following:"}
            {saver.engineIssues.length > 0 && (
              <ul className="list-disc pl-4 text-[13px]">
                {saver.engineIssues.map((i) => (
                  <li key={`${i.node}${i.text}`}>{i.text}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {test && !test.running && (
        <div
          role="status"
          className={cn(
            "mx-4 mt-4 flex items-center gap-2.5 rounded-md px-3.5 py-2.5 text-sm text-foreground md:mx-6",
            wentWrong(test) ? "bg-danger-soft" : "bg-success-soft"
          )}
        >
          {wentWrong(test) ? <XIcon className="size-4 shrink-0 text-danger" /> : <CheckIcon className="size-4 shrink-0 text-success" />}
          <span className="min-w-0 flex-1">
            {test.failed
              ? "The test run did not start. Please try again later."
              : test.status === "failed"
                ? "Test run finished with an error. The failed block is marked in red."
                : "Test run finished. Each block shows what it did."}
          </span>
          <button type="button" className="shrink-0 text-xs font-medium underline underline-offset-2" onClick={clearTest}>
            Clear
          </button>
        </div>
      )}
      {dirty && workflowId && <p className="mx-4 mt-3 text-xs text-muted-foreground md:mx-6">Save your changes to test them.</p>}

      <TestRunContext value={lit}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* The Blocks panel folds like the app's sidebar (AppShell): the width slides 240 <-> 72
            (ease-in-out, 200 ms) and the full list crossfades with the icon rail. Phones and
            tablets always get the full list on top. */}
        <aside
          className={cn(
            "relative hidden shrink-0 border-border lg:block lg:overflow-hidden lg:border-r lg:transition-[width] lg:duration-200 lg:ease-in-out motion-reduce:transition-none",
            fold.open ? "lg:w-60" : "lg:w-[72px]"
          )}
        >
          <div
            inert={desktop && !fold.open}
            className={cn(
              "flex flex-col gap-2 p-4 lg:absolute lg:inset-y-0 lg:left-0 lg:w-60 lg:overflow-x-hidden lg:overflow-y-auto lg:transition-opacity lg:duration-150 lg:ease-out motion-reduce:transition-none",
              fold.open ? "lg:opacity-100 lg:delay-50" : "lg:opacity-0"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-foreground">Blocks</h2>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden lg:inline-flex"
                aria-label="Fold the Blocks panel ([)"
                title="Fold ([)"
                onClick={fold.toggle}
              >
                <PanelLeftCloseIcon />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Drag one onto the canvas, or tap to add it at the end.</p>
            {palette(false)}
          </div>
          <div
            inert={!desktop || fold.open}
            className={cn(
              "absolute inset-y-0 left-0 hidden w-[72px] flex-col items-center gap-2 overflow-x-hidden overflow-y-auto px-3 py-4 transition-opacity duration-150 ease-out motion-reduce:transition-none lg:flex",
              fold.open ? "opacity-0" : "opacity-100 delay-50"
            )}
          >
            <Button variant="ghost" size="icon-sm" aria-label="Open the Blocks panel ([)" title="Open ([)" onClick={fold.toggle}>
              <PanelLeftOpenIcon />
            </Button>
            {palette(true)}
          </div>
        </aside>

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

      {/* Phones (design B1 mobile): Add a block, always there (Ancung, 10 Nov: with an If the Add
          card is gone and the + between blocks was easy to miss), then Test run and Save. */}
      <div className="flex flex-col gap-2 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <Button variant="secondary" disabled={lineCloses(draft.line) || draft.line.at(-1)?.kind === "if"} onClick={() => setSheetAt(mainEnd)}>
          <PlusIcon />
          Add a block
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => void runTest()} disabled={!workflowId || running || dirty || saving}>
            {running ? <Spinner /> : <FlaskConicalIcon />}
            {running ? "Testing" : "Test run"}
          </Button>
          <Button onClick={() => void save()} disabled={saving || (Boolean(workflowId) && !dirty)}>
            {saving ? <Spinner /> : <CheckIcon />}
            Save
          </Button>
        </div>
      </div>

      <AddBlockSheet
        at={sheetAt}
        name={name}
        line={draft.line}
        self={self}
        onClose={() => setSheetAt(null)}
        onPick={(kind) => {
          const at = sheetAt ?? mainEnd
          setSheetAt(null)
          addAt(kind, at)
        }}
      />
      </TestRunContext>
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <Dialog open={guard.asking} onOpenChange={(open) => !open && guard.stay()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>You have unsaved changes</DialogTitle>
            <DialogDescription>
              {problems.length > 0
                ? "If you leave now, your changes will be lost. The job cannot be saved until the missing details are filled in."
                : "If you leave now, your changes will be lost."}
            </DialogDescription>
          </DialogHeader>
          {/* Two buttons (Ancung, 10 Nov: three were too many): X, Esc or a click outside keep editing.
              Discard sits apart on the left, the safe choice on the right. */}
          <DialogFooter>
            <Button variant="ghost" className="text-danger sm:mr-auto" onClick={guard.discard}>
              Discard changes
            </Button>
            {problems.length > 0 ? (
              <Button onClick={guard.stay}>Keep editing</Button>
            ) : (
              <Button
                disabled={saving}
                onClick={() => {
                  guard.stay()
                  void save()
                }}
              >
                {saving && <Spinner />}
                Save
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DragContext>
    </BuilderContext>
  )
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

const SHORTCUTS: [string, string][] = [
  ["Scroll, or drag empty canvas", "Move around"],
  ["Shift + scroll", "Move sideways"],
  ["Space + drag, or the middle button", "Move around from anywhere"],
  ["Ctrl/Cmd + scroll, or pinch", "Zoom"],
  ["+ and -", "Zoom in and out"],
  ["0", "Back to 100%"],
  ["1", "Fit the job on screen"],
  ["Ctrl/Cmd + S", "Save"],
  ["Ctrl/Cmd + Enter", "Test run"],
  ["Ctrl/Cmd + Z", "Undo"],
  ["Ctrl/Cmd + Shift + Z", "Redo"],
  ["Up and Down", "Pick the block above or below"],
  ["Delete", "Delete the picked block"],
  ["Esc", "Close the settings"],
  ["[", "Fold or open the Blocks panel"],
  ["]", "Close or open the settings"],
  ["?", "This list"],
]

/** The shortcuts, taken from n8n's and kept to the simple ones (Ancung, 9 Nov). */
function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Letters and arrows wait while you type in a field. Save and Test run work from anywhere.</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col">
          {SHORTCUTS.map(([keys, does]) => (
            <div key={keys} className="flex items-center justify-between gap-4 py-1.5 text-sm">
              <dt className="text-muted-foreground">{does}</dt>
              <dd className="shrink-0 rounded-sm bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{keys}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}

/** "Add a block" on phones (B1.8): only the blocks that fit at that place. */
function AddBlockSheet({
  at,
  name,
  line,
  self,
  onClose,
  onPick,
}: {
  at: Place | null
  name: string
  line: Block[]
  self: Self
  onClose: () => void
  onPick: (kind: Kind) => void
}) {
  const place = at ?? { path: [], index: line.length }
  const here = lineAt(line, place.path)
  const label = (x: Block) => (x.kind === "agent" ? `Ask ${name}` : x.kind === "tool" ? (toolInfo(x.tool)?.title ?? "a tool") : x.kind === "http" ? "Call a website" : x.kind === "if" ? "the If" : "End")
  const where = `${place.index === 0 ? (place.path.length ? "At the start of this way" : "After Start") : `After ${label(here[place.index - 1])}`}${place.index < here.length ? `, before ${label(here[place.index])}` : ""}`
  const off = (kind: Kind, why: string) => (canPlace(line, place.path, place.index, kind, self) ? null : why)
  const options: { kind: Kind; tone: Tone; icon: ReactNode; title: string; line: string; off?: string | null }[] = [
    { kind: "agent", tone: "agent", icon: <BotIcon />, title: `Ask ${name}`, line: `${name} writes or decides something`, off: off("agent", "The path already ends above") },
    { kind: "tool", tone: "tool", icon: <SearchIcon />, title: "Use a tool", line: "An account, the time, the calendar, the inbox", off: off("tool", "The path already ends above") },
    { kind: "http", tone: "http", icon: <GlobeIcon />, title: "Call a website", line: "Send something to your own service", off: off("http", "The path already ends above") },
    { kind: "if", tone: "if", icon: <GitBranchIcon />, title: "If or else", line: "Choose one of two ways", off: off("if", "Add a check or a website before it") },
    { kind: "end", tone: "start", icon: <OctagonXIcon />, title: "End", line: "Stop the job on this path", off: off("end", "Only at the end of a path") },
  ]
  return (
    // A drawer from the bottom you can swipe away, like the live view on phones (Ancung, 10 Nov).
    <Drawer open={at !== null} onOpenChange={(open) => !open && onClose()} showSwipeHandle>
      <DrawerContent className="gap-3 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DrawerHeader className="p-0 text-left">
          <DrawerTitle>Add a block</DrawerTitle>
          <DrawerDescription>{where}</DrawerDescription>
        </DrawerHeader>
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {options.map((o) => (
            <li key={o.kind}>
              <button
                type="button"
                disabled={Boolean(o.off)}
                onClick={() => onPick(o.kind)}
                className="flex w-full items-center gap-3 rounded-md bg-muted px-3 py-2.5 text-left outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-sm [&>svg]:size-4", TONE[o.tone])}>{o.icon}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium text-foreground">{o.title}</span>
                  <span className="text-xs text-muted-foreground">{o.off ?? o.line}</span>
                </span>
                {!o.off && <PlusIcon className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
      </DrawerContent>
    </Drawer>
  )
}
