"use client"

import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  BotIcon,
  CalendarClockIcon,
  CheckIcon,
  CircleXIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  GlobeIcon,
  KeyboardIcon,
  MinusIcon,
  OctagonXIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  ScanIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { cn } from "cn"
import { Spinner } from "@/components/elements/Spinner"
import { mindHref } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Skeleton } from "@/components/ui/skeleton"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { isApiCode } from "@/lib/api"
import { MEDIA, matches } from "@/lib/media"
import { readPref, writePref } from "@/lib/storage"
import { browserTimeZone } from "@/lib/stream"
import { autopilotApi } from "@/modules/autopilot/api"
import { scheduleText, zoneName } from "@/modules/autopilot/data/schedule"
import { autopilotKeys, useWorkflow, useWorkflows } from "@/modules/autopilot/hooks/useAutopilot"
import { BuilderContext } from "@/modules/builder/components/BuilderContext"
import { BlockSettings } from "@/modules/builder/components/panels/BlockSettings"
import { SettingsFrame } from "@/modules/builder/components/panels/SettingsFrame"
import { PromptPreview } from "@/modules/builder/components/PromptText"
import { newBlock, type Kind } from "@/modules/builder/data/blocks"
import { ifTitle } from "@/modules/builder/data/conditions"
import {
  allBlocks,
  canPlace,
  closes,
  cronOf,
  draftProblems,
  emptyDraft,
  findBlock,
  fromCanvas,
  insertBlock,
  isStep,
  lineAt,
  lineCloses,
  locate,
  NAME_MAX,
  promptParts,
  removeBlock,
  resultsBefore,
  stepsAt,
  toCanvas,
  updateBlock,
  withLine,
  workflowIdFor,
  type Block,
  type Draft,
  type LinePath,
  type Result,
  type Self,
  type Step,
} from "@/modules/builder/data/draft"
import { engineIssues as engineIssuesOf } from "@/modules/builder/data/issues"
import { mainEnd as mainEndOf, parseSlot, placeKey, samePath, type Place } from "@/modules/builder/data/places"
import { finishedWell, nodeSummary, wentWrong, withIf, type NodeRun, type TestState } from "@/modules/builder/data/testRun"
import { TONE, type Tone } from "@/modules/builder/data/tone"
import { toolInfo } from "@/modules/builder/data/tools"
import { useCanvasView } from "@/modules/builder/hooks/useCanvasView"
import { useLeaveGuard } from "@/modules/builder/hooks/useLeaveGuard"
import { useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"
import { useSetSkills, useSkillCatalog } from "@/modules/skills/hooks/useSkills"
import { shortAddress } from "@/modules/wallet/data/address"

const PALETTE_KEY = "hellonear.builder.palette"
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


/** Test run state per canvas node id, read by every block card (B1.2). */
const TestRun = createContext<Record<string, NodeRun>>({})

function Editor({ mindId, workflowId, initial }: { mindId: string; workflowId: string | null; initial: Draft }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const mind = useMind(mindId).data
  const name = mind?.name ?? "Your Mind"
  const address = useMindWallet(mindId).data?.address ?? ""
  // Names the Mind's own wallet in results ("Balance of Omaga") instead of its long address.
  const self = useMemo(() => ({ name, address }), [name, address])
  const builder = useMemo(() => ({ mindId, name, address, self }), [mindId, name, address, self])
  const catalog = useSkillCatalog().data
  const setSkills = useSetSkills(mindId)
  const jobs = useWorkflows(mindId)
  const [draft, setDraft] = useState<Draft>(initial)
  // The block whose settings show on the right; null closes that panel (n8n opens it on demand).
  // Desktop opens on Start's settings; phones open on the canvas, since settings are a sheet there.
  const [selected, setSelected] = useState<string | null>(() => (matches(MEDIA.lg) ? "start" : null))
  const {
    frame: canvasFrame,
    content: canvasContent,
    zoomLabel,
    space: spaceDown,
    panning,
    reset: resetView,
    fit: fitView,
    zoomBy,
    onPointerDown: panStart,
    onPointerMove: panMove,
    endPan,
  } = useCanvasView()
  const [helpOpen, setHelpOpen] = useState(false)
  // Phones (B1.8): a + between blocks opens "Add a block" for that place.
  const [sheetAt, setSheetAt] = useState<Place | null>(null)
  // The fold only applies from lg (1024 px); below that the list sits on top, always open.
  const desktop = useMediaQuery(MEDIA.lg, true)
  // The Blocks panel folds to icons; remembered on this device.
  const [paletteOpen, setPaletteOpen] = useState(() => readPref(PALETTE_KEY) !== "closed")
  const togglePalette = () =>
    setPaletteOpen((open) => {
      writePref(PALETTE_KEY, open ? "closed" : "open")
      return !open
    })

  // Undo and redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z): earlier drafts, up to 50. Typing within a second
  // counts as one change.
  const past = useRef<Draft[]>([])
  const future = useRef<Draft[]>([])
  const prevDraft = useRef(draft)
  const fromHistory = useRef(false)
  const lastChange = useRef(0)
  useEffect(() => {
    if (prevDraft.current === draft) return
    if (fromHistory.current) {
      fromHistory.current = false
    } else {
      const now = Date.now()
      if (now - lastChange.current > 1000 || !past.current.length) {
        past.current.push(prevDraft.current)
        if (past.current.length > 50) past.current.shift()
      }
      lastChange.current = now
      future.current = []
    }
    prevDraft.current = draft
  }, [draft])
  const undo = () => {
    const back = past.current.pop()
    if (!back) return
    future.current.push(draft)
    fromHistory.current = true
    setDraft(back)
  }
  const redo = () => {
    const ahead = future.current.pop()
    if (!ahead) return
    past.current.push(draft)
    fromHistory.current = true
    setDraft(ahead)
  }
  const [saving, setSaving] = useState(false)
  const [engineIssues, setEngineIssues] = useState<{ node: string | null; text: string }[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  // What blocks Save, one click away (Ancung, 10 Nov: Save was off and the reason was hidden in a
  // closed panel): the name goes to the name field in the header, anything else picks its block.
  const nameField = useRef<HTMLInputElement>(null)
  const fix = (where: string) => {
    if (where === "name") {
      nameField.current?.focus()
      return
    }
    if (where === "start" || where === "steps") setSelected("start")
    else setSelected(where)
  }
  // Unsaved changes ask before you leave: the back arrow, the browser's Back, closing the tab.
  const guard = useLeaveGuard(dirty, mindHref(mindId, "autopilot"))
  const [savedTry, setSavedTry] = useState<string | null>(null)
  // Unfinished blocks turn amber only once Save was pressed; a new empty block isn't a mistake yet.
  const [tried, setTried] = useState(false)
  const dirtySinceSave = savedTry !== null && savedTry !== JSON.stringify(draft)
  const [test, setTest] = useState<TestState | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  // Test run (B1.2): the saved job runs once and each block lights up from node.started and
  // node.finished. The API only runs a saved job, so changes must be saved first.
  async function runTest() {
    if (!workflowId) return
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setTest({ running: true, nodes: {}, status: null, failed: false })
    const put = (node: string, run: NodeRun) => setTest((t) => (t ? { ...t, nodes: { ...t.nodes, [node]: run } } : t))
    try {
      await autopilotApi.runNow(
        mindId,
        workflowId,
        (e) => {
          const ev = e as unknown as { type: string; node?: string; status?: string; output?: unknown; error?: unknown }
          if (ev.type === "node.started" && ev.node) put(ev.node, { status: "running" })
          if (ev.type === "node.finished" && ev.node) {
            put(ev.node, ev.status === "ok" ? { status: "ok", note: nodeSummary(ev.output) } : { status: "error", note: String(ev.error ?? "Failed").replace(/^\w*Error:\s*/, "") })
          }
          if (ev.type === "workflow.finished") setTest((t) => (t ? { ...t, status: ev.status ?? null } : t))
        },
        controller.signal
      )
      if (!controller.signal.aborted) setTest((t) => (t ? { ...t, running: false } : t))
    } catch {
      if (!controller.signal.aborted) setTest((t) => (t ? { ...t, running: false, failed: true } : t))
    }
    void queryClient.invalidateQueries({ queryKey: autopilotKeys.runs(mindId, workflowId) })
  }
  const problems = draftProblems(draft)
  // Engine issues pinned to a block mark it too, until the draft changes again.
  const flagged = (id: string) => (tried && problems.some((p) => p.where === id)) || (!dirtySinceSave && engineIssues.some((i) => i.node === id))

  // A job may only use its Mind's tools: the skills it needs and doesn't have are added on Save.
  const blocks = allBlocks(draft.line)
  const usedTools = blocks.flatMap((s) => (s.kind === "tool" ? [s.tool] : s.kind === "http" ? ["http_request"] : []))
  const missingSkills = [...new Set(usedTools.map((t) => catalog?.find((s) => s.tools.includes(t))?.skillId).filter((s): s is string => Boolean(s)))].filter(
    (s) => mind && !mind.skills.includes(s)
  )

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setBlock = (id: string, patch: Partial<Block>) => setDraft((d) => ({ ...d, line: updateBlock(d.line, id, patch) }))
  const mainEnd = mainEndOf(draft.line)

  // Drag and drop (B1.7): a block from the palette, or a block (an If with its ways) to a new place.
  const [drag, setDrag] = useState<{ add: Kind } | { move: string } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // The drop spots show a frame after dragstart (a layout change during dragstart cancels the
  // drag in Chrome), and not at all if the drag already ended by then.
  const dragging = useRef(false)
  const startDrag = (d: { add: Kind } | { move: string }) => {
    dragging.current = true
    requestAnimationFrame(() => {
      if (dragging.current) setDrag(d)
    })
  }
  const endDrag = () => {
    dragging.current = false
    setDrag(null)
    setOver(null)
  }
  /** Move a block (an If with its ways) to a place; a place after it in its own line shifts back by one. */
  function moveBlock(id: string, to: Place) {
    setDraft((d) => {
      const from = locate(d.line, id)
      const blk = findBlock(d.line, id)
      if (!from || !blk) return d
      const without = withLine(d.line, from.path, (l) => l.filter((x) => x.id !== id))
      const same = samePath(from.path, to.path)
      return { ...d, line: insertBlock(without, to.path, same && from.index < to.index ? to.index - 1 : to.index, blk) }
    })
  }
  function dropAt(at: Place) {
    if (!drag) return
    if ("move" in drag) moveBlock(drag.move, at)
    else addAt(drag.add, at)
    endDrag()
  }
  /** Where a dragged thing may land, by the engine's tree rules (#164). */
  function accepts(at: Place): boolean {
    if (!drag) return false
    if ("move" in drag) {
      const blk = findBlock(draft.line, drag.move)
      const from = locate(draft.line, drag.move)
      if (!blk || !from) return false
      // Not into its own ways, and not onto its own place.
      if (at.path.some((x) => x.at === drag.move)) return false
      if (samePath(from.path, at.path) &&(at.index === from.index || at.index === from.index + 1)) return false
      return canPlace(draft.line, at.path, at.index, blk.kind, self)
    }
    return canPlace(draft.line, at.path, at.index, drag.add, self)
  }
  const spot = (at: Place) =>
    !desktop && !drag ? (
      canPlace(draft.line, at.path, at.index, "agent", self) ? <TapSpot key={`tap-${placeKey(at)}`} onClick={() => setSheetAt(at)} /> : null
    ) : accepts(at) ? (
      <DropSpot key={`spot-${placeKey(at)}`} id={`spot-${placeKey(at)}`} over={over} setOver={setOver} onDrop={() => dropAt(at)} label="Drop here" />
    ) : null

  /** A new block of `kind` at a place. */
  function addAt(kind: Kind, at: Place) {
    const blk = newBlock(kind, draft.line, at, self, address)
    setDraft((d) => ({ ...d, line: insertBlock(d.line, at.path, at.index, blk) }))
    setSelected(blk.id)
  }
  /** A tap in the palette adds at the end of the main line. */
  function addStep(kind: Kind) {
    if (canPlace(draft.line, mainEnd.path, mainEnd.index, kind, self)) addAt(kind, mainEnd)
    else toast(kind === "if" ? "Add a check or a website before an If." : "The job's main line already ends. Drag the block to where it should go.")
  }
  const addIf = () => addStep("if")
  function removeStep(id: string) {
    setDraft((d) => ({ ...d, line: removeBlock(d.line, id) }))
    setSelected("start")
  }

  async function save() {
    // Checked when you press Save, not shown all along (Ancung, 10 Nov: the standing warnings were
    // too much): jump to the first thing missing and say it once.
    if (problems.length > 0) {
      setTried(true)
      fix(problems[0].where)
      toast(problems[0].text)
      return
    }
    setSaving(true)
    setEngineIssues([])
    setSavedTry(JSON.stringify(draft))
    setSaveError(null)
    const id = workflowId ?? workflowIdFor(draft.name, jobs.data?.map((j) => j.workflowId) ?? [])
    try {
      if (missingSkills.length && mind) await setSkills.mutateAsync([...mind.skills, ...missingSkills])
      await autopilotApi.save(mindId, id, toCanvas(draft))
      await queryClient.invalidateQueries({ queryKey: autopilotKeys.list(mindId) })
      await queryClient.invalidateQueries({ queryKey: autopilotKeys.one(mindId, id) })
      router.push(`${mindHref(mindId, "autopilot")}?job=${encodeURIComponent(id)}`)
    } catch (err) {
      setSaving(false)
      if (isApiCode(err, "invalid_workflow")) {
        const issues = (err.details.issues as { path?: string; message?: string }[] | undefined) ?? []
        setEngineIssues(engineIssuesOf(issues, toCanvas(draft).nodes.map((n) => n.id)))
      } else {
        setSaveError("Could not save. No changes were made. Please try again later.")
      }
    }
  }

  const picked = selected ? findBlock(draft.line, selected) : null
  const slotRef = parseSlot(selected)
  const slotIf = slotRef ? findBlock(draft.line, slotRef.ifId) : null
  const slot = slotIf?.kind === "if" && slotRef ? { block: slotIf, h: slotRef.h } : null
  const canIf = canPlace(draft.line, mainEnd.path, mainEnd.index, "if", self)
  const canEnd = canPlace(draft.line, mainEnd.path, mainEnd.index, "end", self)

  /**
   * A line of blocks (#164): a + between blocks, each block, and under an If its Yes and No side by
   * side, each a line of its own (that may hold more Ifs) with a slot to add the next block. A way
   * without End carries on after its If, so the line goes on below, centred.
   */
  // What each block shows after a Test run, Ifs included (they send no events of their own).
  const lit = withIf(test?.nodes ?? {}, draft.line, finishedWell(test))

  const renderLine = (line: Block[], path: LinePath, goesOn = false): ReactNode =>
    line.map((blk, i) => {
      // When this If's ways run out the job goes on below it (a job saved with steps after an If).
      const waysGoOn = blk.kind === "if" && (i < line.length - 1 || goesOn)
      const joins = waysGoOn && blk.kind === "if" && !closes(blk)
      const at = { path, index: i }
      const before = stepsAt(draft.line, path, i)
      return (
        <div key={blk.id} className="flex flex-col items-center">
          {spot(at)}
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
                <StepCard step={blk} name={name} results={resultsBefore(before, undefined, self)} active={selected === blk.id} problem={flagged(blk.id)} onClick={() => setSelected(blk.id)} />
              ) : blk.kind === "if" ? (
                <BlockCard tone="if" icon={<GitBranchIcon />} kind="If or else" nodeId={blk.id} title={ifTitle(blk, before)} active={selected === blk.id} warn={flagged(blk.id)} onClick={() => setSelected(blk.id)} />
              ) : (
                <BlockCard tone="start" icon={<OctagonXIcon />} kind="End" nodeId={blk.id} title="The job stops here" active={selected === blk.id} warn={flagged(blk.id)} onClick={() => setSelected(blk.id)} />
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
                const end = { path: wayPath, index: way.length }
                // The way that ran turns green from the If down to its first block.
                const ran = lit[blk.id]?.note === (h === "then" ? "Yes" : "No") ? ({ status: "ok" } as const) : undefined
                return (
                  <div key={h} className="relative flex min-w-[300px] flex-col items-center">
                    <span aria-hidden className={cn("absolute top-0 h-px", ran ? "bg-success" : "bg-border-strong", h === "then" ? "right-[-12px] left-1/2" : "right-1/2 left-[-12px]")} />
                    <Wire run={ran} className="h-6" />
                    <span className="pb-1.5 text-xs font-medium text-muted-foreground">{h === "then" ? "Yes" : "No"}</span>
                    {renderLine(way, wayPath, waysGoOn)}
                    {/* The next block on this way; none after an If, which goes on in its own ways. */}
                    {!lineCloses(way) && way.at(-1)?.kind !== "if" && (
                      <>
                        {way.length > 0 && <span aria-hidden className="h-3 w-px bg-border-strong" />}
                        <EndingSlot
                          id={`slot-${blk.id}-${h}`}
                          more={way.length > 0}
                          goesOn={waysGoOn}
                          active={selected === `${blk.id}:${h}`}
                          over={over}
                          setOver={setOver}
                          accepts={accepts(end)}
                          onPick={() => setSelected(`${blk.id}:${h}`)}
                          onDrop={() => dropAt(end)}
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

  // Keyboard shortcuts (n8n's, the simple ones; "?" lists them). Letters and arrows wait while you
  // type in a field; Save and Test run work from anywhere.
  const order = ["start", ...blocks.map((x) => x.id)]
  const removeSelected = () => {
    if (!selected || selected === "start") return
    if (findBlock(draft.line, selected)) removeStep(selected)
  }
  const shortcuts = useRef<(e: KeyboardEvent) => void>(() => undefined)
  useEffect(() => {
    shortcuts.current = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const t = e.target as HTMLElement | null
      const typing = Boolean(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest("[role='listbox'], [role='option'], [role='dialog']")))
      const k = e.key.toLowerCase()
      if (mod && k === "s") {
        e.preventDefault()
        if (!saving && (!workflowId || dirty)) void save()
        return
      }
      if (mod && e.key === "Enter") {
        e.preventDefault()
        if (workflowId && !dirty && !test?.running) void runTest()
        return
      }
      if (typing) return
      if (mod && k === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod) return
      if (e.key === "+" || e.key === "=") zoomBy(1.2)
      else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.2)
      else if (e.key === "0") resetView()
      else if (e.key === "1") fitView()
      else if (e.key === "[") togglePalette()
      else if (e.key === "]") setSelected((sel) => (sel ? null : "start"))
      else if (e.key === "?") setHelpOpen(true)
      else if (e.key === "Escape") setSelected(null)
      else if (e.key === "Delete" || e.key === "Backspace") removeSelected()
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const i = selected ? order.indexOf(selected) : -1
        const next = e.key === "ArrowDown" ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1)
        setSelected(order[next] ?? "start")
      } else return
      e.preventDefault()
    }
  })
  useEffect(() => {
    const on = (e: KeyboardEvent) => shortcuts.current(e)
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [])

  return (
    <BuilderContext value={builder}>
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
            disabled={Boolean(test?.running) || dirty || saving}
            title={dirty ? "Save your changes to test them" : "Runs the saved job once"}
          >
            {test?.running ? <Spinner /> : <FlaskConicalIcon />}
            {test?.running ? "Testing" : "Test run"}
          </Button>
        )}
        <Button className="hidden lg:inline-flex" onClick={() => void save()} disabled={saving || (Boolean(workflowId) && !dirty)}>
          {saving && <Spinner />}
          Save
        </Button>
      </header>

      {(engineIssues.length > 0 || saveError) && (
        <div role="alert" className="mx-4 mt-4 flex items-start gap-2.5 rounded-md bg-danger-soft px-3.5 py-3 text-sm text-foreground md:mx-6">
          <CircleXIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="flex flex-col gap-1">
            {saveError ?? "The job was not saved. Fix the following:"}
            {engineIssues.length > 0 && (
              <ul className="list-disc pl-4 text-[13px]">
                {engineIssues.map((i) => (
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
          <button type="button" className="shrink-0 text-xs font-medium underline underline-offset-2" onClick={() => setTest(null)}>
            Clear
          </button>
        </div>
      )}
      {dirty && workflowId && <p className="mx-4 mt-3 text-xs text-muted-foreground md:mx-6">Save your changes to test them.</p>}

      <TestRun.Provider value={lit}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* The Blocks panel folds like the app's sidebar (AppShell): the width slides 240 <-> 72
            (ease-in-out, 200 ms) and the full list crossfades with the icon rail. Phones and
            tablets always get the full list on top. */}
        <aside
          className={cn(
            "relative hidden shrink-0 border-border lg:block lg:overflow-hidden lg:border-r lg:transition-[width] lg:duration-200 lg:ease-in-out motion-reduce:transition-none",
            paletteOpen ? "lg:w-60" : "lg:w-[72px]"
          )}
        >
          <div
            inert={desktop && !paletteOpen}
            className={cn(
              "flex flex-col gap-2 p-4 lg:absolute lg:inset-y-0 lg:left-0 lg:w-60 lg:overflow-x-hidden lg:overflow-y-auto lg:transition-opacity lg:duration-150 lg:ease-out motion-reduce:transition-none",
              paletteOpen ? "lg:opacity-100 lg:delay-50" : "lg:opacity-0"
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
                onClick={togglePalette}
              >
                <PanelLeftCloseIcon />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Drag one onto the canvas, or tap to add it at the end.</p>
            {palette(false)}
          </div>
          <div
            inert={!desktop || paletteOpen}
            className={cn(
              "absolute inset-y-0 left-0 hidden w-[72px] flex-col items-center gap-2 overflow-x-hidden overflow-y-auto px-3 py-4 transition-opacity duration-150 ease-out motion-reduce:transition-none lg:flex",
              paletteOpen ? "opacity-0" : "opacity-100 delay-50"
            )}
          >
            <Button variant="ghost" size="icon-sm" aria-label="Open the Blocks panel ([)" title="Open ([)" onClick={togglePalette}>
              <PanelLeftOpenIcon />
            </Button>
            {palette(true)}
          </div>
        </aside>

        <main
          ref={canvasFrame}
          aria-label="Job steps"
          onDragOver={(e) => drag && e.preventDefault()}
          onPointerDown={panStart}
          onPointerMove={panMove}
          onPointerUp={(e) => {
            const moved = endPan(e)
            // A click on empty canvas closes the settings panel, as in n8n.
            if (!moved && e.button === 0 && !spaceDown && e.target instanceof Element && !e.target.closest("button, a, input, textarea, [draggable='true']")) setSelected(null)
          }}
          onPointerCancel={endPan}
          // Dots that fade a little when zoomed out (--dot-opacity, set with the grid in useCanvasView).
          style={{ backgroundImage: "radial-gradient(color-mix(in oklab, var(--color-border) calc(var(--dot-opacity, 1) * 100%), transparent) 1px, transparent 1px)" }}
          className={cn(
            "relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden select-none",
            panning ? "cursor-grabbing" : spaceDown ? "cursor-grab" : "cursor-default"
          )}
        >
          <div
            ref={canvasContent}
            className={cn("absolute top-0 left-0 flex w-max min-w-[640px] origin-top-left flex-col items-center pb-24 will-change-transform", spaceDown && "pointer-events-none")}
          >
          <BlockCard tone="start" icon={<CalendarClockIcon />} kind="Start" title={scheduleText(cronOf(draft))} line={`${zoneName(draft.timezone)} time`} active={selected === "start"} onClick={() => setSelected("start")} />
          {renderLine(draft.line, [])}
          {/* The end of the main line is this card, unless the path already ends; it is also where a
              dragged block lands (Ancung, 9 Nov). */}
          {!lineCloses(draft.line) && draft.line.at(-1)?.kind !== "if" && (
          <Linked>
            <button
              type="button"
              onClick={() => (desktop ? addStep("agent") : setSheetAt(mainEnd))}
              onDragOver={(e) => {
                if (!accepts(mainEnd)) return
                e.preventDefault()
                if (over !== "end") setOver("end")
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
              }}
              onDrop={(e) => {
                if (!accepts(mainEnd)) return
                e.preventDefault()
                dropAt(mainEnd)
              }}
              className={cn(
                "flex w-full max-w-[280px] flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-3 text-center outline-none transition-colors duration-100 ease-out focus-visible:ring-2 focus-visible:ring-focus",
                over === "end"
                  ? "border-solid border-foreground bg-surface-hover ring-4 ring-foreground/10"
                  : drag && accepts(mainEnd)
                    ? "border-foreground/60 bg-surface"
                    : "border-border-strong bg-surface/60 hover:bg-surface"
              )}
            >
              <PlusIcon className={cn("size-4", over === "end" ? "text-foreground" : "text-muted-foreground")} />
              <span className="text-sm font-medium text-foreground">{drag && accepts(mainEnd) ? "Drop to add it here" : "Add the next step"}</span>
              <span className="text-xs text-muted-foreground">{desktop ? `Ask ${name} to do something` : "Tap to pick a block"}</span>
            </button>
          </Linked>
          )}
          </div>

          {/* Zoom controls (n8n's, bottom left): out, the level (click for 100%), in, fit, shortcuts. */}
          <div className="absolute top-3 right-3 flex flex-col-reverse items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-xs lg:top-auto lg:right-auto lg:bottom-4 lg:left-4 lg:flex-row">
            <Button variant="ghost" size="icon-sm" className="lg:order-last" aria-label="Fit the job on screen (1)" title="Fit (1)" onClick={fitView}>
              <ScanIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Zoom out (-)" title="Zoom out (-)" onClick={() => zoomBy(1 / 1.2)}>
              <MinusIcon />
            </Button>
            <button
              type="button"
              onClick={() => resetView()}
              title="Back to 100% (0)"
              className="hidden min-w-12 lg:block rounded-full px-1.5 py-1 text-center text-xs font-medium text-foreground tabular-nums outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span ref={zoomLabel}>100%</span>
            </button>
            <Button variant="ghost" size="icon-sm" aria-label="Zoom in (+)" title="Zoom in (+)" onClick={() => zoomBy(1.2)}>
              <PlusIcon />
            </Button>
            <span aria-hidden className="mx-0.5 hidden h-4 w-px bg-border lg:order-last lg:block" />
            <Button variant="ghost" size="icon-sm" className="hidden lg:order-last lg:inline-flex" aria-label="Keyboard shortcuts (?)" title="Keyboard shortcuts (?)" onClick={() => setHelpOpen(true)}>
              <KeyboardIcon />
            </Button>
          </div>
        </main>

        {selected && (
        <SettingsFrame desktop={desktop} onClose={() => setSelected(null)}>
          <BlockSettings
            draft={draft}
            picked={picked}
            slot={slot}
            issues={engineIssues.filter((i) => i.node === selected && !dirtySinceSave)}
            missingSkills={missingSkills}
            missingSkillFor={(tool) => missingSkills.find((x) => catalog?.find((c) => c.skillId === x)?.tools.includes(tool))}
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
          <Button variant="outline" onClick={() => void runTest()} disabled={!workflowId || Boolean(test?.running) || dirty || saving}>
            {test?.running ? <Spinner /> : <FlaskConicalIcon />}
            {test?.running ? "Testing" : "Test run"}
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
      </TestRun.Provider>
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
    </BuilderContext>
  )
}

/**
 * A place between two steps where a dragged block may go (B1.7): a slim dashed line with a small +,
 * bright while hovered. Its hit area is taller than it looks so it's easy to land on.
 */
function DropSpot({ id, over, setOver, onDrop, label }: { id: string; over: string | null; setOver: (id: string | null) => void; onDrop: () => void; label: string }) {
  const hot = over === id
  return (
    <div className="flex w-[280px] max-w-full flex-col items-center">
      <div
        aria-label={label}
        onDragOver={(e) => {
          e.preventDefault()
          if (!hot) setOver(id)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          onDrop()
        }}
        className="flex h-7 w-full items-center gap-2"
      >
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

/** The line from the block above, coloured by how the block below went in a Test run. */
function Wire({ run, className }: { run?: NodeRun; className?: string }) {
  return <span aria-hidden className={cn(className, wireTone(run))} />
}

/** Grey at rest; while its block works a light runs down it (`wire-flow`); then green or red. */
const wireTone = (run?: NodeRun) =>
  run?.status === "running" ? "wire-flow" : run?.status === "ok" ? "w-px bg-success" : run?.status === "error" ? "w-px bg-danger" : "w-px bg-border-strong"

function Linked({ nodeId, children }: { nodeId?: string; children: ReactNode }) {
  const run = useContext(TestRun)[nodeId ?? ""]
  return (
    <div className="flex flex-col items-center">
      <Wire run={run} className="h-6 transition-colors duration-300 ease-out" />
      {children}
    </div>
  )
}

function StepCard({
  step,
  name,
  results = [],
  active,
  problem,
  onClick,
}: {
  step: Step
  name: string
  /** Earlier results, so a prompt shows {Balance} instead of its reference. */
  results?: Result[]
  active: boolean
  problem: boolean
  onClick: () => void
}) {
  if (step.kind === "agent") {
    return (
      <BlockCard
        tone="agent"
        icon={<BotIcon />}
        kind={`Ask ${name}`}
        nodeId={step.id}
        title={step.prompt.trim() ? <PromptPreview parts={promptParts(step.prompt.trim(), results)} className="line-clamp-2" /> : "Say what to do"}
        line={step.prompt.trim() ? undefined : "Not set yet"}
        active={active}
        warn={problem}
        onClick={onClick}
      />
    )
  }
  if (step.kind === "http") {
    let host = "Not set yet"
    try {
      host = new URL(step.url).hostname || host
    } catch {
      // keep "Not set yet"
    }
    return (
      <BlockCard
        tone="http"
        icon={<GlobeIcon />}
        kind="Call a website"
        nodeId={step.id}
        title={`${step.method === "GET" ? "Read from" : "Send to"} ${host}`}
        line={step.key ? `With your key ${step.key}` : undefined}
        active={active}
        warn={problem}
        onClick={onClick}
      />
    )
  }
  const info = toolInfo(step.tool)
  const account = step.args.accountId
  const own = step.tool === "googlecalendar_block_time" ? `${step.args.title?.trim() || "An event"} at ${step.args.at || "09:00"}` : step.tool === "mail_send_to_owner" ? step.args.subject?.trim() || "No subject yet" : null
  return (
    <BlockCard
      tone="tool"
      icon={<SearchIcon />}
      kind="Use a tool"
      nodeId={step.id}
      title={info?.title ?? "A tool"}
      line={account ? shortAddress(account) : own ?? info?.line}
      mono={Boolean(account)}
      active={active}
      warn={problem}
      onClick={onClick}
    />
  )
}


function BlockCard({
  icon,
  kind,
  title,
  line,
  mono,
  active,
  warn,
  dashed,
  nodeId,
  onClick,
  tone,
}: {
  tone: Tone
  icon: ReactNode
  kind: string
  title: ReactNode
  line?: string
  mono?: boolean
  active: boolean
  warn?: boolean
  dashed?: boolean
  /** The canvas node id, to show its Test run state. */
  nodeId?: string
  onClick: () => void
}) {
  const run = useContext(TestRun)[nodeId ?? ""]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-[280px] max-w-full flex-col gap-1 rounded-lg border bg-surface px-4 py-3 text-left shadow-xs outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-focus",
        dashed && "border-dashed bg-surface/60",
        // The edge says the state (Test run, or amber when something is missing)...
        run?.status === "running"
          ? "border-info"
          : run?.status === "ok"
            ? "border-success"
            : run?.status === "error"
              ? "border-danger"
              : warn
                ? "border-warning"
                : "border-border",
        // ...and the picked block gets its own outline, a gap away, lifted (Ancung, 9 Nov: a 1 px
        // edge didn't show which block was picked, and the amber ones drew the eye instead).
        active ? "shadow-md ring-2 ring-foreground ring-offset-2 ring-offset-background" : run?.status === "running" ? "node-glow" : "hover:bg-surface-hover"
      )}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-[6px] [&>svg]:size-3.5", TONE[tone])}>{icon}</span>
        {kind}
      </span>
      <span className="text-sm font-semibold break-words text-foreground">{title}</span>
      {line && <span className={cn("text-xs text-muted-foreground", mono && "font-mono")}>{line}</span>}
      {run && (
        <span
          className={cn(
            "flex items-start gap-1.5 pt-1 text-xs [&>svg]:mt-px [&>svg]:size-3.5 [&>svg]:shrink-0",
            run.status === "error" ? "text-danger" : run.status === "ok" ? "text-success" : "text-info"
          )}
        >
          {run.status === "running" ? <Spinner /> : run.status === "ok" ? <CheckIcon /> : <XIcon />}
          <span className="min-w-0 break-words text-foreground">{run.status === "running" ? "Working..." : (run.note ?? "Done")}</span>
        </span>
      )}
    </button>
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

/** An empty way of the If: tap to pick a block, or drop one on it. Empty, the path stops there. */
function EndingSlot({
  id,
  more = false,
  goesOn = false,
  active,
  over,
  setOver,
  accepts,
  onPick,
  onDrop,
}: {
  id: string
  /** The way already has steps: a smaller slot that adds one more. */
  more?: boolean
  /** Blocks follow its If, so empty it carries on to them instead of stopping. */
  goesOn?: boolean
  active: boolean
  over: string | null
  setOver: (id: string | null) => void
  accepts: boolean
  onPick: () => void
  onDrop: () => void
}) {
  const hot = over === id
  return (
    <button
      type="button"
      onClick={onPick}
      onDragOver={(e) => {
        if (!accepts) return
        e.preventDefault()
        if (!hot) setOver(id)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
      }}
      onDrop={(e) => {
        if (!accepts) return
        e.preventDefault()
        onDrop()
      }}
      aria-pressed={active}
      className={cn(
        "flex w-[280px] max-w-full flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-3 text-center outline-none transition-[background-color,border-color,box-shadow] duration-100 ease-out focus-visible:ring-2 focus-visible:ring-focus",
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

/** The + between two blocks on phones (B1.8): tap it to add a block there. */
function TapSpot({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex w-[280px] max-w-full flex-col items-center">
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
