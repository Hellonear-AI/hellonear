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
  Loader2Icon,
  MinusIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  ScanIcon,
  SearchIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { cn } from "cn"
import { mindHref } from "@/components/layout/nav"
import { ChoiceSelect } from "@/components/elements/ChoiceSelect"
import { TimePicker } from "@/components/elements/TimePicker"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { ApiError } from "@/lib/api"
import { autopilotApi } from "@/modules/autopilot/api"
import { nodeSummary, type NodeRun } from "@/modules/builder/data/testRun"
import { TONE, type Tone } from "@/modules/builder/data/tone"
import { PromptEditor, PromptPreview, type PromptEditorHandle } from "@/modules/builder/components/PromptText"
import { useCanvasView } from "@/modules/builder/hooks/useCanvasView"
import { useLeaveGuard } from "@/modules/builder/hooks/useLeaveGuard"
import { scheduleText, zoneName } from "@/modules/autopilot/data/schedule"
import { autopilotKeys, useWorkflow, useWorkflows } from "@/modules/autopilot/hooks/useAutopilot"
import {
  cronOf,
  draftProblems,
  emptyDraft,
  fromCanvas,
  NAME_MAX,
  PROMPT_MAX,
  ref,
  comparable,
  INVERT,
  moveStepIn,
  tokenLabels,
  promptFromDisplay,
  promptParts,
  type Self,
  notesBefore,
  resultsBefore,
  stepFields,
  toCanvas,
  workflowIdFor,
  type AskStep,
  type Branch,
  type Draft,
  type Op,
  type HttpStep,
  type Repeat,
  type Step,
} from "@/modules/builder/data/draft"
import { toolInfo, TOOLS } from "@/modules/builder/data/tools"
import { useSecrets } from "@/modules/connections/hooks/useKeys"
import { useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"
import { skillCopy } from "@/modules/skills/data/skills"
import { useSetSkills, useSkillCatalog } from "@/modules/skills/hooks/useSkills"
import { shortAddress } from "@/modules/wallet/data/address"

const ZONE = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const OPS: { op: Op; label: string; number?: boolean }[] = [
  { op: "eq", label: "is" },
  { op: "ne", label: "is not" },
  { op: "lt", label: "less than", number: true },
  { op: "lte", label: "at most", number: true },
  { op: "gt", label: "more than", number: true },
  { op: "gte", label: "at least", number: true },
]

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

let counter = 0
const newId = (kind: string) => `${kind}-${Date.now().toString(36)}${counter++}`

function Editor({ mindId, workflowId, initial }: { mindId: string; workflowId: string | null; initial: Draft }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const mind = useMind(mindId).data
  const name = mind?.name ?? "Your Mind"
  const address = useMindWallet(mindId).data?.address ?? ""
  // Names the Mind's own wallet in results ("Balance of Omaga") instead of its long address.
  const self = useMemo(() => ({ name, address }), [name, address])
  const catalog = useSkillCatalog().data
  const setSkills = useSetSkills(mindId)
  const jobs = useWorkflows(mindId)
  const [draft, setDraft] = useState<Draft>(initial)
  // The block whose settings show on the right; null closes that panel (n8n opens it on demand).
  // Desktop opens on Start's settings; phones open on the canvas, since settings are a sheet there.
  const [selected, setSelected] = useState<string | null>(() => (window.matchMedia("(min-width: 1024px)").matches ? "start" : null))
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
  const [addAt, setAddAt] = useState<number | null>(null)
  // The fold only applies from lg (1024 px); below that the list sits on top, always open.
  const desktop = useSyncExternalStore(
    (on) => {
      const q = window.matchMedia("(min-width: 1024px)")
      q.addEventListener("change", on)
      return () => q.removeEventListener("change", on)
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true
  )
  // The Blocks panel folds to icons; remembered on this device.
  const [paletteOpen, setPaletteOpen] = useState(() => {
    try {
      return window.localStorage.getItem("hellonear.builder.palette") !== "closed"
    } catch {
      return true
    }
  })
  const togglePalette = () =>
    setPaletteOpen((open) => {
      try {
        window.localStorage.setItem("hellonear.builder.palette", open ? "closed" : "open")
      } catch {
        // Not remembered, still works.
      }
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
    const br = draft.branch
    if (br && br.then?.id === where) setSelected(`${br.id}:then`)
    else if (br && br.else?.id === where) setSelected(`${br.id}:else`)
    else if (where === "start" || where === "steps") setSelected("start")
    else setSelected(where)
  }
  // Unsaved changes ask before you leave: the back arrow, the browser's Back, closing the tab.
  const guard = useLeaveGuard(dirty, mindHref(mindId, "autopilot"))
  const [savedTry, setSavedTry] = useState<string | null>(null)
  // Unfinished blocks turn amber only once Save was pressed; a new empty block isn't a mistake yet.
  const [tried, setTried] = useState(false)
  const dirtySinceSave = savedTry !== null && savedTry !== JSON.stringify(draft)
  const [test, setTest] = useState<{ running: boolean; nodes: Record<string, NodeRun>; status: string | null; failed: boolean } | null>(null)
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
  const usedTools = [...draft.steps, draft.branch?.then, draft.branch?.else].flatMap((s) => (!s ? [] : s.kind === "tool" ? [s.tool] : s.kind === "http" ? ["http_request"] : []))
  const missingSkills = [...new Set(usedTools.map((t) => catalog?.find((s) => s.tools.includes(t))?.skillId).filter((s): s is string => Boolean(s)))].filter(
    (s) => mind && !mind.skills.includes(s)
  )

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setStep = (id: string, patch: Partial<Step>) => setDraft((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? ({ ...s, ...patch } as Step) : s)) }))
  const setBranch = (patch: Partial<Branch>) => setDraft((d) => (d.branch ? { ...d, branch: { ...d.branch, ...patch } } : d))

  // Drag and drop (B1.7): a block from the palette, or a step to a new place. Taps still add at the end.
  const [drag, setDrag] = useState<{ add: "agent" | "tool" | "http" | "if" } | { move: string } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // The drop spots show a frame after dragstart (a layout change during dragstart cancels the
  // drag in Chrome), and not at all if the drag already ended by then.
  const dragging = useRef(false)
  const startDrag = (d: { add: "agent" | "tool" | "http" | "if" } | { move: string }) => {
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
  const moveStep = (id: string, to: number) => setDraft((d) => ({ ...d, steps: moveStepIn(d.steps, id, to) }))
  function dropAt(at: number) {
    if (!drag) return
    if ("move" in drag) moveStep(drag.move, at)
    else if (drag.add === "if") addIf()
    else addStep(drag.add, at)
    endDrag()
  }
  /** Where a dragged thing may land: any place in the line; an If only at the end (one per job). */
  function accepts(at: number): boolean {
    if (!drag) return false
    if ("move" in drag) {
      const from = draft.steps.findIndex((s) => s.id === drag.move)
      return at !== from && at !== from + 1
    }
    if (drag.add === "if") return !draft.branch && resultsBefore(draft.steps, undefined, self).some(comparable) && at === draft.steps.length
    return true
  }
  const spot = (at: number) =>
    !desktop && !drag ? (
      <TapSpot key={`tap-${at}`} onClick={() => setAddAt(at)} />
    ) : accepts(at) ? (
      <DropSpot key={`spot-${at}`} id={`spot-${at}`} over={over} setOver={setOver} onDrop={() => dropAt(at)} label="Drop here" />
    ) : null

  function addStep(kind: "agent" | "tool" | "http", at?: number) {
    const id = newId(kind === "agent" ? "ask" : kind)
    const step: Step =
      kind === "agent"
        ? { id, kind, prompt: "" }
        : kind === "http"
          ? { id, kind, method: "GET", url: "https://", key: "", body: "" }
          : { id, kind, tool: TOOLS[0].tool, args: { accountId: address } }
    setDraft((d) => {
      const steps = [...d.steps]
      steps.splice(at ?? steps.length, 0, step)
      return { ...d, steps }
    })
    setSelected(id)
  }
  const newStep = (kind: "agent" | "tool" | "http"): Step => {
    const id = newId(kind === "agent" ? "ask" : kind)
    return kind === "agent"
      ? { id, kind, prompt: "" }
      : kind === "http"
        ? { id, kind, method: "GET", url: "https://", key: "", body: "" }
        : { id, kind, tool: TOOLS[0].tool, args: { accountId: address } }
  }
  /** Put a block on If yes or If no (B1: each way of an If takes one block; empty stops). */
  function setEnding(h: "then" | "else", kind: "agent" | "tool" | "http") {
    const br = draft.branch
    if (!br) return
    const step = newStep(kind)
    setBranch({ [h]: step } as Partial<Branch>)
    setSelected(`${br.id}:${h}`)
  }
  function addIf() {
    const first = resultsBefore(draft.steps, undefined, self).find(comparable)
    const id = newId("check")
    setDraft((d) => ({
      ...d,
      branch: { id, stepId: first?.stepId ?? "", field: first?.name ?? "", op: first?.kind === "number" ? "lt" : "eq", right: "", then: null, else: null },
    }))
    setSelected(id)
  }
  function removeStep(id: string) {
    setDraft((d) => ({
      ...d,
      steps: d.steps.filter((s) => s.id !== id),
      branch: d.branch && d.branch.stepId === id ? { ...d.branch, stepId: "", field: "" } : d.branch,
    }))
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
      if (err instanceof ApiError && err.code === "invalid_workflow") {
        const issues = (err.details.issues as { path?: string; message?: string }[] | undefined) ?? []
        // The engine names blocks by their ids ("node ask-x", "nodes.2…"): pin each issue to its block (B1.3).
        const ids = toCanvas(draft).nodes.map((n) => n.id)
        setEngineIssues(
          issues.map((i) => {
            const where = `${i.path ?? ""} ${i.message ?? ""}`
            const byId = where.match(/node ([\w-]+)/)?.[1]
            const byIndex = where.match(/nodes\.(\d+)/)?.[1]
            const node = byId && ids.includes(byId) ? byId : byIndex !== undefined ? (ids[Number(byIndex)] ?? null) : null
            return { node, text: (i.message ?? "This job contains something that is not allowed.").replace(/^node [\w-]+:\s*/, "") }
          })
        )
      } else {
        setSaveError("Could not save. No changes were made. Please try again later.")
      }
    }
  }

  const b = draft.branch
  const step = draft.steps.find((s) => s.id === selected)
  const ending = b && (selected === `${b.id}:then` ? "then" : selected === `${b.id}:else` ? "else" : null)
  const canIf = !b && resultsBefore(draft.steps, undefined, self).some(comparable)

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
        line={b ? "A job can have only one" : canIf ? "Choose one of two ways" : "Add a check or a website first"}
        onClick={addIf}
        disabled={!canIf}
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
    </>
  )

  // Keyboard shortcuts (n8n's, the simple ones; "?" lists them). Letters and arrows wait while you
  // type in a field; Save and Test run work from anywhere.
  const order = [
    "start",
    ...draft.steps.map((x) => x.id),
    ...(b ? [b.id, `${b.id}:then`, `${b.id}:else`] : []),
  ]
  const removeSelected = () => {
    if (!selected || selected === "start") return
    if (b && selected === b.id) {
      set({ branch: null })
      setSelected("start")
    } else if (b && (selected === `${b.id}:then` || selected === `${b.id}:else`)) {
      setBranch({ [selected.endsWith(":then") ? "then" : "else"]: null } as Partial<Branch>)
    } else if (draft.steps.some((x) => x.id === selected)) {
      removeStep(selected)
    }
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
            {test?.running ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <FlaskConicalIcon />}
            {test?.running ? "Testing" : "Test run"}
          </Button>
        )}
        <Button className="hidden lg:inline-flex" onClick={() => void save()} disabled={saving || (Boolean(workflowId) && !dirty)}>
          {saving && <Loader2Icon className="animate-spin motion-reduce:animate-none" />}
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
            test.failed || test.status === "failed" ? "bg-danger-soft" : "bg-success-soft"
          )}
        >
          {test.failed || test.status === "failed" ? <XIcon className="size-4 shrink-0 text-danger" /> : <CheckIcon className="size-4 shrink-0 text-success" />}
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

      <TestRun.Provider value={withIf(test?.nodes ?? {}, draft.branch, Boolean(test && !test.running && !test.failed && test.status !== "failed"))}>
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
            className={cn("absolute top-0 left-0 flex w-[640px] origin-top-left flex-col items-center pb-24 will-change-transform", spaceDown && "pointer-events-none")}
          >
          <BlockCard tone="start" icon={<CalendarClockIcon />} kind="Start" title={scheduleText(cronOf(draft))} line={`${zoneName(draft.timezone)} time`} active={selected === "start"} onClick={() => setSelected("start")} />
          {draft.steps.length > 0 && spot(0)}
          {draft.steps.map((s, i) => (
            <div key={s.id} className="flex flex-col items-center">
              <Linked>
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move"
                    e.dataTransfer.setData("text/plain", s.id)
                    startDrag({ move: s.id })
                  }}
                  onDragEnd={endDrag}
                  className={cn("cursor-grab active:cursor-grabbing", drag && "move" in drag && drag.move === s.id && "opacity-40")}
                >
                  <StepCard step={s} name={name} results={resultsBefore(draft.steps, i, self)} active={selected === s.id} problem={flagged(s.id)} onClick={() => setSelected(s.id)} />
                </div>
              </Linked>
              {(i + 1 < draft.steps.length || b) && spot(i + 1)}
            </div>
          ))}
          {/* With an If, new steps go in through the + between blocks; the Add card only ends a line
              without one (Ancung, 10 Nov). */}
          {!b && (
          <Linked>
            {/* The end of the line is this card: it is also where a dragged block lands (Ancung, 9 Nov:
                a second "Drop here" box under it was confusing). */}
            <button
              type="button"
              onClick={() => (desktop ? addStep("agent") : setAddAt(draft.steps.length))}
              onDragOver={(e) => {
                if (!accepts(draft.steps.length)) return
                e.preventDefault()
                if (over !== "end") setOver("end")
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
              }}
              onDrop={(e) => {
                if (!accepts(draft.steps.length)) return
                e.preventDefault()
                dropAt(draft.steps.length)
              }}
              className={cn(
                "flex w-full max-w-[280px] flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-3 text-center outline-none transition-colors duration-100 ease-out focus-visible:ring-2 focus-visible:ring-focus",
                over === "end"
                  ? "border-solid border-foreground bg-surface-hover ring-4 ring-foreground/10"
                  : drag && accepts(draft.steps.length)
                    ? "border-foreground/60 bg-surface"
                    : "border-border-strong bg-surface/60 hover:bg-surface"
              )}
            >
              <PlusIcon className={cn("size-4", over === "end" ? "text-foreground" : "text-muted-foreground")} />
              <span className="text-sm font-medium text-foreground">
                {drag && accepts(draft.steps.length) ? (drag && "add" in drag && drag.add === "if" ? "Drop to add the If here" : "Drop to add it here") : "Add the next step"}
              </span>
              <span className="text-xs text-muted-foreground">{desktop ? `Ask ${name} to do something` : "Tap to pick a block"}</span>
            </button>
          </Linked>
          )}
          {b && (
            <>
              <Linked>
                <BlockCard
                  tone="if"
                  icon={<GitBranchIcon />}
                  kind="If or else"
                  nodeId={b.id}
                  title={ifTitle(b, draft.steps)}
                  active={selected === b.id}
                  warn={flagged(b.id)}
                  onClick={() => setSelected(b.id)}
                />
              </Linked>
              <div className="flex w-full max-w-[600px] items-start justify-center gap-3">
                {(["then", "else"] as const).map((h) => (
                  <div key={h} className="flex min-w-0 flex-1 flex-col items-center">
                    <span aria-hidden className="h-6 w-px bg-border-strong" />
                    <span className="pb-1.5 text-xs font-medium text-muted-foreground">{h === "then" ? "Yes" : "No"}</span>
                    {b[h] ? (
                      <>
                        <StepCard
                          step={b[h]!}
                          name={name}
                          results={resultsBefore(draft.steps, undefined, self)}
                          active={selected === `${b.id}:${h}`}
                          problem={flagged(b[h]!.id)}
                          onClick={() => setSelected(`${b.id}:${h}`)}
                        />
                        <span aria-hidden className="h-3 w-px bg-border-strong" />
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">End</span>
                      </>
                    ) : (
                      <EndingSlot
                        id={`slot-${h}`}
                        active={selected === `${b.id}:${h}`}
                        over={over}
                        setOver={setOver}
                        accepts={Boolean(drag && "add" in drag && drag.add !== "if")}
                        onPick={() => setSelected(`${b.id}:${h}`)}
                        onDrop={() => {
                          if (drag && "add" in drag && drag.add !== "if") setEnding(h, drag.add)
                          endDrag()
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
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
          {step?.kind === "agent" ? (
            <AskPanel name={name} title={`Ask ${name}`} step={step} results={resultsBefore(draft.steps, draft.steps.indexOf(step), self)} onChange={(p) => setStep(step.id, { prompt: p })} onDelete={() => removeStep(step.id)} />
          ) : step?.kind === "http" ? (
            <HttpPanel
              step={step}
              results={resultsBefore(draft.steps, draft.steps.indexOf(step), self)}
              missingSkill={missingSkills.find((s) => catalog?.find((c) => c.skillId === s)?.tools.includes("http_request"))}
              name={name}
              onChange={(patch) => setStep(step.id, patch)}
              onDelete={() => removeStep(step.id)}
            />
          ) : step?.kind === "tool" ? (
            <ToolPanel
              step={step}
              address={address}
              name={name}
              notes={notesBefore(draft.steps, draft.steps.indexOf(step))}
              missingSkill={missingSkills.find((s) => catalog?.find((c) => c.skillId === s)?.tools.includes(step.tool))}
              onChange={(patch) => setStep(step.id, patch)}
              onDelete={() => removeStep(step.id)}
            />
          ) : b && selected === b.id ? (
            <IfPanel branch={b} steps={draft.steps} self={self} onChange={setBranch} onDelete={() => (set({ branch: null }), setSelected("start"))} />
          ) : b && ending && b[ending] ? (
            (() => {
              const e = b[ending]!
              const label = ending === "then" ? "If yes" : "If no"
              const patch = (p: Partial<Step>) => setBranch({ [ending]: { ...e, ...p } as Step } as Partial<Branch>)
              const remove = () => setBranch({ [ending]: null } as Partial<Branch>)
              return e.kind === "agent" ? (
                <AskPanel name={name} title={`${label}: ask ${name}`} step={e} results={resultsBefore(draft.steps, undefined, self)} onChange={(p) => patch({ prompt: p })} onDelete={remove} />
              ) : e.kind === "http" ? (
                <HttpPanel step={e} results={resultsBefore(draft.steps, undefined, self)} missingSkill={missingSkills.find((x) => catalog?.find((c) => c.skillId === x)?.tools.includes("http_request"))} name={name} onChange={patch} onDelete={remove} />
              ) : (
                <ToolPanel step={e} address={address} name={name} notes={notesBefore(draft.steps)} missingSkill={missingSkills.find((x) => catalog?.find((c) => c.skillId === x)?.tools.includes(e.tool))} onChange={patch} onDelete={remove} />
              )
            })()
          ) : b && ending ? (
            <EndingPanel name={name} which={ending} otherAsks={b[ending === "then" ? "else" : "then"]?.kind === "agent"} onPick={(kind) => setEnding(ending, kind)} />
          ) : (
            <StartPanel draft={draft} set={set} />
          )}
          {(() => {
            const here = engineIssues.filter((i) => i.node === selected && !dirtySinceSave)
            return here.length ? (
              <ul className="flex flex-col gap-1 rounded-md bg-danger-soft p-3 text-xs text-foreground">
                {here.map((i) => (
                  <li key={i.text}>{i.text}</li>
                ))}
              </ul>
            ) : null
          })()}
          {missingSkills.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Saving adds {missingSkills.map((s) => skillCopy(s).title).join(" and ")} to {name}: a job can only use its Mind&apos;s skills.
            </p>
          )}
        </SettingsFrame>
        )}
      </div>

      {/* Phones (design B1 mobile): the hint, then Test run and Save across the bottom. */}
      <div className="flex flex-col gap-2 border-t border-border bg-background px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <p className="text-xs text-muted-foreground">Tap + to add a block. Tap a block to change it.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => void runTest()} disabled={!workflowId || Boolean(test?.running) || dirty || saving}>
            {test?.running ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <FlaskConicalIcon />}
            {test?.running ? "Testing" : "Test run"}
          </Button>
          <Button onClick={() => void save()} disabled={saving || (Boolean(workflowId) && !dirty)}>
            {saving ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <CheckIcon />}
            Save
          </Button>
        </div>
      </div>

      <AddBlockSheet
        at={addAt}
        name={name}
        steps={draft.steps}
        hasIf={Boolean(b)}
        canIf={canIf}
        onClose={() => setAddAt(null)}
        onPick={(kind) => {
          const at = addAt ?? draft.steps.length
          setAddAt(null)
          if (kind === "if") addIf()
          else addStep(kind, at)
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
                {saving && <Loader2Icon className="animate-spin motion-reduce:animate-none" />}
                Save
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Conditions send no events (§3): the If lights up from the ending that ran, or, once a run ended
 * well with its checked step done and no ending run, from the "stop" it took.
 */
function withIf(nodes: Record<string, NodeRun>, b: Branch | null, finished: boolean): Record<string, NodeRun> {
  if (!b) return nodes
  const took = [b.then, b.else].find((x) => x && nodes[x.id])
  if (took) return { ...nodes, [b.id]: { status: "ok", note: took === b.then ? "Yes" : "No" } }
  if (finished && nodes[b.stepId]?.status === "ok") return { ...nodes, [b.id]: { status: "ok", note: b.then ? "No, so it stopped" : "Yes, so it stopped" } }
  return nodes
}

function ifTitle(b: Branch, steps: Step[]): string {
  const field = stepFields(steps.find((s) => s.id === b.stepId)).find((f) => f.name === b.field)
  if (!field || !b.right.trim()) return "Pick what to check"
  // "If balance is less than 5 NEAR", "If weekday is Friday", "If weekday is not Sunday".
  const label = OPS.find((o) => o.op === b.op)?.label ?? b.op
  const verb = label.startsWith("is") ? label : `is ${label}`
  const what = field.label.replace(/ \(.*\)$/, "").toLowerCase()
  return `If ${what} ${verb} ${b.right.trim()}${field.name === "balanceNear" ? " NEAR" : ""}`
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

function Linked({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <span aria-hidden className="h-6 w-px bg-border-strong" />
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

const short = (s: string) => (s.trim().length > 60 ? `${s.trim().slice(0, 60)}...` : s.trim())

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
        active ? "shadow-md ring-2 ring-foreground ring-offset-2 ring-offset-background" : run?.status === "running" ? "ring-2 ring-info/30" : "hover:bg-surface-hover"
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
          {run.status === "running" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : run.status === "ok" ? <CheckIcon /> : <XIcon />}
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

const field = "flex flex-col gap-1.5"
const label = "text-[13px] font-medium text-foreground"
/** "No key" in the key list (Base UI needs a non-empty value); saved as no header. */
const NO_KEY = "__none__"

function PanelHead({ icon, title, tone = "start" }: { icon: ReactNode; title: string; tone?: Tone }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("flex size-8 items-center justify-center rounded-sm [&>svg]:size-4", TONE[tone])}>{icon}</span>
      <h2 className="pr-8 text-[15px] font-semibold text-foreground">{title}</h2>
    </div>
  )
}

function DeleteBlock({ onClick, children = "Delete this block" }: { onClick: () => void; children?: ReactNode }) {
  return (
    <Button variant="outline" className="w-fit text-danger" onClick={onClick}>
      <Trash2Icon />
      {children}
    </Button>
  )
}

function StartPanel({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <>
      <PanelHead icon={<CalendarClockIcon />} title="Start" />
      <label className={field}>
        <span className={label}>Name</span>
        <Input value={draft.name} maxLength={NAME_MAX} placeholder="Morning inbox summary" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className={field}>
        <span className={label}>Runs</span>
        <ChoiceSelect<Repeat>
          aria-label="Runs"
          value={draft.repeat}
          onChange={(repeat) => set({ repeat })}
          options={[
            { value: "daily", label: "Every day" },
            { value: "weekdays", label: "Weekdays" },
            { value: "weekly", label: "Once a week" },
          ]}
        />
      </div>
      {draft.repeat === "weekly" && (
        <div className={field}>
          <span className={label}>On</span>
          <ChoiceSelect
            aria-label="On"
            value={String(draft.day)}
            onChange={(d) => set({ day: Number(d) })}
            options={DAYS.map((d, i) => ({ value: String(i), label: d }))}
          />
        </div>
      )}
      <div className={field}>
        <span className={label}>At</span>
        <TimePicker aria-label="At" value={draft.time} onChange={(time) => set({ time })} />
      </div>
      <div className={field}>
        <span className={label}>Time zone</span>
        <span className="text-sm text-muted-foreground">{zoneName(draft.timezone)}, from this device</span>
      </div>
      <p className="text-xs text-muted-foreground">Autopilot runs it at this time once you turn it on.</p>
    </>
  )
}

type Result = ReturnType<typeof resultsBefore>[number]

function PromptField({
  name,
  value,
  results,
  onChange,
  labelText,
  placeholder = "Sum up the emails that need me today, in three lines.",
  hint,
}: {
  name: string
  value: string
  results: Result[]
  onChange: (p: string) => void
  labelText?: string
  placeholder?: string
  /** Replaces the line under the field (an Ask step's says what the Mind can't do alone). */
  hint?: ReactNode
}) {
  const labels = tokenLabels(results)
  const editor = useRef<PromptEditorHandle>(null)
  const labelId = useId()
  return (
    <div className={field}>
      <span id={labelId} className={label}>
        {labelText ?? `What should ${name} do?`}
      </span>
      <PromptEditor ref={editor} value={value} parts={promptParts(value, results)} onChange={onChange} placeholder={placeholder} labelledBy={labelId} />
      {/* Results grouped by the step they come from, so two balances say whose they are (Ancung, 10 Nov). */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
          <span className="text-xs font-medium text-muted-foreground">Put in a result</span>
          {groupBySource(results).map((g) => (
            <div key={g.stepId} className="flex flex-col gap-1.5">
              <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-[6px] [&>svg]:size-3", TONE[g.tone])}>{g.icon}</span>
                <span className="truncate">{g.source}</span>
              </span>
              <span className="flex flex-wrap gap-1.5 pl-7">
                {g.items.map((r) => (
                  <button
                    key={r.name}
                    type="button"
                    // Keep the caret in the field while the chip is clicked.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => editor.current?.insert(ref(r.stepId, r.name), labels.get(`${r.stepId}.${r.name}`) ?? r.label, r.stepKind === "http" ? "http" : "tool")}
                    title={`Puts ${labels.get(`${r.stepId}.${r.name}`)} in the text`}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-xs text-foreground outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <PlusIcon className="size-3 text-muted-foreground" />
                    {r.label.replace(/ \(.*\)$/, "")}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
      {hint ?? <span className="text-xs text-muted-foreground">{name} uses the skills it has. It can&apos;t pay, ask you to approve, or use keys while it runs alone.</span>}
    </div>
  )
}

/** Results in step order, one group per step, with that step's colour and icon. */
function groupBySource(results: Result[]) {
  const out: { stepId: string; source: string; tone: Tone; icon: ReactNode; items: Result[] }[] = []
  for (const r of results) {
    const g = out.find((x) => x.stepId === r.stepId)
    if (g) g.items.push(r)
    else out.push({ stepId: r.stepId, source: r.source, tone: r.stepKind === "http" ? "http" : "tool", icon: r.stepKind === "http" ? <GlobeIcon /> : <SearchIcon />, items: [r] })
  }
  return out
}

function AskPanel({ name, title, step, results, onChange, onDelete }: { name: string; title: string; step: AskStep; results: Result[]; onChange: (p: string) => void; onDelete: () => void }) {
  return (
    <>
      <PanelHead tone="agent" icon={<BotIcon />} title={title} />
      <PromptField name={name} value={step.prompt} results={results} onChange={onChange} />
      <DeleteBlock onClick={onDelete} />
    </>
  )
}

function ToolPanel({
  step,
  address,
  name,
  notes,
  missingSkill,
  onChange,
  onDelete,
}: {
  step: Extract<Step, { kind: "tool" }>
  address: string
  name: string
  /** Notes from earlier Ask steps, the only results "Email me" may send (#146). */
  notes: Result[]
  missingSkill?: string
  onChange: (patch: Partial<Step>) => void
  onDelete: () => void
}) {
  const info = toolInfo(step.tool)
  const setArg = (k: string, v: string) => onChange({ args: { ...step.args, [k]: v } })
  return (
    <>
      <PanelHead tone="tool" icon={<SearchIcon />} title="Use a tool" />
      <div className={field}>
        <span className={label}>Tool</span>
        <ChoiceSelect
          aria-label="Tool"
          value={step.tool}
          onChange={(tool) => onChange({ tool, args: tool === "near_view_account" ? { accountId: address } : { ...(toolInfo(tool)?.defaults ?? {}) } })}
          options={TOOLS.map((t) => ({ value: t.tool, label: t.title }))}
        />
        <span className="text-xs text-muted-foreground">{info?.line}</span>
      </div>
      {info?.args.map((a) =>
        a.kind === "account" ? (
          <label key={a.name} className={field}>
            <span className={label}>{a.label}</span>
            <Input
              value={step.args[a.name] ?? ""}
              placeholder="shop.testnet"
              className="font-mono"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setArg(a.name, e.target.value.trim().toLowerCase())}
            />
            {address && step.args[a.name] !== address && (
              <button type="button" className="w-fit text-xs font-medium text-foreground underline underline-offset-2" onClick={() => setArg(a.name, address)}>
                Use {name}&apos;s own wallet
              </button>
            )}
          </label>
        ) : a.kind === "note" ? (
          <div key={a.name} className="flex flex-col gap-2">
            <PromptField
              name={name}
              labelText={a.label}
              placeholder={a.placeholder}
              value={step.args[a.name] ?? ""}
              results={notes}
              onChange={(v) => setArg(a.name, v)}
              hint={<span className="text-xs text-muted-foreground">Sent from {name}&apos;s own address to the Gmail you connected, and nobody else.</span>}
            />
            {!notes.length && <p className="text-xs text-muted-foreground">Add an Ask step before this one: the email sends what {name} wrote, never an email or a web page as it came in.</p>}
          </div>
        ) : a.kind === "time" ? (
          <div key={a.name} className={field}>
            <span className={label}>{a.label}</span>
            <TimePicker aria-label={a.label} value={step.args[a.name] || "09:00"} onChange={(v) => setArg(a.name, v)} />
            <span className="text-xs text-muted-foreground">Today, in the job&apos;s time zone.</span>
          </div>
        ) : (
          <label key={a.name} className={field}>
            <span className={label}>{a.label}</span>
            <Input
              value={step.args[a.name] ?? ""}
              placeholder={a.placeholder}
              inputMode={a.kind === "minutes" ? "numeric" : undefined}
              onChange={(e) => setArg(a.name, a.kind === "minutes" ? e.target.value.replace(/\D/g, "").slice(0, 3) : e.target.value)}
            />
          </label>
        )
      )}
      {missingSkill && <p className="text-xs text-muted-foreground">This tool comes with {skillCopy(missingSkill).title}. Saving adds that skill to {name}.</p>}
      <DeleteBlock onClick={onDelete} />
    </>
  )
}

function IfPanel({ branch, steps, self, onChange, onDelete }: { branch: Branch; steps: Step[]; self: Self; onChange: (p: Partial<Branch>) => void; onDelete: () => void }) {
  const results = resultsBefore(steps, undefined, self).filter(comparable)
  const current = results.find((r) => r.stepId === branch.stepId && r.name === branch.field)
  const ops = OPS.filter((o) => current?.kind === "number" || !o.number)
  return (
    <>
      <PanelHead tone="if" icon={<GitBranchIcon />} title="If or else" />
      <div className={field}>
        <span className={label}>Look at</span>
        <ChoiceSelect
          aria-label="Look at"
          value={current ? `${current.stepId}|${current.name}` : ""}
          placeholder="Pick a result"
          onChange={(v) => {
            const [stepId, f] = v.split("|")
            const r = results.find((x) => x.stepId === stepId && x.name === f)
            onChange({ stepId, field: f, op: r?.kind === "number" ? "lt" : "eq", right: "" })
          }}
          options={results.map((r) => ({ value: `${r.stepId}|${r.name}`, label: r.label, hint: r.source }))}
        />
        <span className="text-xs text-muted-foreground">Pick a result from an earlier block.</span>
      </div>
      <div className={field}>
        <span className={label}>Is</span>
        <ChoiceSelect<Op> aria-label="Is" value={branch.op} onChange={(op) => onChange({ op })} options={ops.map((o) => ({ value: o.op, label: o.label }))} />
      </div>
      <label className={field}>
        <span className={label}>{current?.kind === "number" ? "This number" : "This text"}</span>
        <Input
          value={branch.right}
          inputMode={current?.kind === "number" ? "decimal" : "text"}
          placeholder={current?.kind === "number" ? "5" : current?.name === "weekday" ? "Friday" : ""}
          onChange={(e) => onChange({ right: e.target.value })}
        />
      </label>
      <p className="text-xs text-muted-foreground">Then pick what happens for yes and for no on the canvas. A way left empty stops the job there.</p>
      <Button variant="outline" className="w-fit" onClick={() => onChange({ op: INVERT[branch.op], then: branch.else, else: branch.then })}>
        Swap Yes and No
      </Button>
      <DeleteBlock onClick={onDelete} />
    </>
  )
}

function EndingPanel({
  name,
  which,
  otherAsks,
  onPick,
}: {
  name: string
  which: "then" | "else"
  /** The other way already asks the Mind, which the engine allows only once. */
  otherAsks: boolean
  onPick: (kind: "agent" | "tool" | "http") => void
}) {
  const options: { kind: "agent" | "tool" | "http"; tone: Tone; icon: ReactNode; title: string; off?: string }[] = [
    { kind: "agent", tone: "agent", icon: <BotIcon />, title: `Ask ${name}`, off: otherAsks ? `Only one way can ask ${name}` : undefined },
    { kind: "tool", tone: "tool", icon: <SearchIcon />, title: "Use a tool" },
    { kind: "http", tone: "http", icon: <GlobeIcon />, title: "Call a website" },
  ]
  return (
    <>
      <PanelHead icon={<SquareIcon />} title={which === "then" ? "If yes" : "If no"} />
      <p className="text-sm text-muted-foreground">Nothing runs here yet, so the job stops. Add a block, or drag one onto this way.</p>
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={o.kind}
            type="button"
            disabled={Boolean(o.off)}
            onClick={() => onPick(o.kind)}
            className="flex items-center gap-3 rounded-md bg-muted px-3 py-2.5 text-left outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          >
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-sm [&>svg]:size-4", TONE[o.tone])}>{o.icon}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium text-foreground">{o.title}</span>
              {o.off && <span className="text-xs text-muted-foreground">{o.off}</span>}
            </span>
            {!o.off && <PlusIcon className="size-4 shrink-0 text-muted-foreground" />}
          </button>
        ))}
      </div>
    </>
  )
}

/** An empty way of the If: tap to pick a block, or drop one on it. Empty means the job stops. */
function EndingSlot({
  id,
  active,
  over,
  setOver,
  accepts,
  onPick,
  onDrop,
}: {
  id: string
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
      <span className="text-sm font-medium text-foreground">{accepts ? "Drop to add it here" : "Add a step"}</span>
      <span className="text-xs text-muted-foreground">Empty: the job stops here</span>
    </button>
  )
}

function HttpPanel({
  step,
  results,
  missingSkill,
  name,
  onChange,
  onDelete,
}: {
  step: HttpStep
  results: Result[]
  missingSkill?: string
  name: string
  onChange: (patch: Partial<Step>) => void
  onDelete: () => void
}) {
  const keys = useSecrets().data ?? []
  return (
    <>
      <PanelHead tone="http" icon={<GlobeIcon />} title="Call a website" />
      <div className={field}>
        <span className={label}>Do</span>
        <ChoiceSelect<HttpStep["method"]>
          aria-label="Do"
          value={step.method}
          onChange={(method) => onChange({ method })}
          options={[
            { value: "GET", label: "Read from it (GET)" },
            { value: "POST", label: "Send to it (POST)" },
          ]}
        />
      </div>
      <label className={field}>
        <span className={label}>Address</span>
        <Input value={step.url} placeholder="https://example.com/status" autoCapitalize="none" spellCheck={false} onChange={(e) => onChange({ url: e.target.value })} />
      </label>
      <div className={field}>
        <span className={label}>Key</span>
        <ChoiceSelect
          aria-label="Key"
          value={step.key || NO_KEY}
          onChange={(key) => onChange({ key: key === NO_KEY ? "" : key })}
          options={[{ value: NO_KEY, label: "No key" }, ...keys.map((k) => ({ value: k.name, label: k.name }))]}
        />
        <span className="text-xs text-muted-foreground">
          {step.key
            ? "Sent as Authorization: Bearer, only to the sites the key allows. A job with a key runs with Run now, but can't run on a schedule yet."
            : keys.length
              ? "Pick a key saved in Connections if the site needs one."
              : "Keys you save in Connections show up here."}
        </span>
      </div>
      {step.method === "POST" && <PromptField name={name} value={step.body} results={results} onChange={(body) => onChange({ body })} labelText="What to send" placeholder="Balance is low: please top up." />}
      {missingSkill && <p className="text-xs text-muted-foreground">Websites come with {skillCopy(missingSkill).title}. Saving adds that skill to {name}.</p>}
      <DeleteBlock onClick={onDelete} />
    </>
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

/** Settings for the picked block: a side panel on desktop, a bottom sheet on phones (B1.5). */
function SettingsFrame({ desktop, onClose, children }: { desktop: boolean; onClose: () => void; children: ReactNode }) {
  if (desktop) {
    return (
      <aside className="relative flex shrink-0 flex-col gap-4 border-border p-4 lg:w-[340px] lg:overflow-y-auto lg:border-l">
        <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Close the settings (Esc)" title="Close (Esc)" onClick={onClose}>
          <XIcon />
        </Button>
        {children}
      </aside>
    )
  }
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[85dvh] gap-0 rounded-t-xl p-0">
        <SheetTitle className="sr-only">Block settings</SheetTitle>
        <div className="relative flex flex-col gap-4 overflow-y-auto p-4">
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Close" onClick={onClose}>
            <XIcon />
          </Button>
          {children}
        </div>
        <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
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
  steps,
  hasIf,
  canIf,
  onClose,
  onPick,
}: {
  at: number | null
  name: string
  steps: Step[]
  hasIf: boolean
  canIf: boolean
  onClose: () => void
  onPick: (kind: "agent" | "tool" | "http" | "if") => void
}) {
  const place = at ?? steps.length
  const label = (x: Step) => (x.kind === "agent" ? `Ask ${name}` : x.kind === "tool" ? (toolInfo(x.tool)?.title ?? "a tool") : "Call a website")
  const where = `${place === 0 ? "After Start" : `After ${label(steps[place - 1])}`}${place < steps.length ? `, before ${label(steps[place])}` : hasIf ? ", before the If" : ""}`
  const ifReason = hasIf ? "A job can have only one, and this one already does" : place < steps.length ? "Only at the end of the job" : !canIf ? "Add a check or a website first" : null
  const options: { kind: "agent" | "tool" | "http" | "if"; tone: Tone; icon: ReactNode; title: string; line: string; off?: string | null }[] = [
    { kind: "agent", tone: "agent", icon: <BotIcon />, title: `Ask ${name}`, line: `${name} writes or decides something` },
    { kind: "tool", tone: "tool", icon: <SearchIcon />, title: "Use a tool", line: "An account, the time, the calendar, the inbox" },
    { kind: "http", tone: "http", icon: <GlobeIcon />, title: "Call a website", line: "Send something to your own service" },
    { kind: "if", tone: "if", icon: <GitBranchIcon />, title: "If or else", line: "Choose one of two ways", off: ifReason },
  ]
  return (
    <Sheet open={at !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-3 rounded-t-xl px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="p-0">
          <SheetTitle>Add a block</SheetTitle>
          <SheetDescription>{where}</SheetDescription>
        </SheetHeader>
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
      </SheetContent>
    </Sheet>
  )
}
