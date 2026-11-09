"use client"

import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon, BotIcon, CalendarClockIcon, CheckIcon, CircleXIcon, FlaskConicalIcon, GitBranchIcon, GlobeIcon, Loader2Icon, PlusIcon, SearchIcon, SquareIcon, Trash2Icon, XIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "cn"
import { mindHref } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { autopilotApi } from "@/modules/autopilot/api"
import { nodeSummary, type NodeRun } from "@/modules/builder/data/testRun"
import { dropDraft, keepDraft, readDraft } from "@/modules/builder/data/autosave"
import { timeAgo } from "@/lib/format"
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
  moveStepIn,
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
  if (workflowId && !existing.data) return <Gone mindId={mindId} text="This job couldn't be loaded." />
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
  const catalog = useSkillCatalog().data
  const setSkills = useSetSkills(mindId)
  const jobs = useWorkflows(mindId)
  const [draft, setDraft] = useState<Draft>(initial)
  // Changes kept on this device from an earlier visit (autosave), offered back once.
  const [kept, setKept] = useState(() => {
    const k = readDraft(mindId, workflowId)
    return k && JSON.stringify(k.draft) !== JSON.stringify(initial) ? k : null
  })
  const [selected, setSelected] = useState<string>("start")
  const [saving, setSaving] = useState(false)
  const [engineIssues, setEngineIssues] = useState<{ node: string | null; text: string }[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  // Autosave: every change is kept on this device until Save, so leaving loses nothing. Not while
  // an earlier draft waits for Restore or Discard, so it isn't overwritten first.
  useEffect(() => {
    if (kept) return
    const t = setTimeout(() => (dirty ? keepDraft(mindId, workflowId, draft) : dropDraft(mindId, workflowId)), 400)
    return () => clearTimeout(t)
  }, [draft, dirty, kept, mindId, workflowId])
  const [savedTry, setSavedTry] = useState<string | null>(null)
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
            put(ev.node, ev.status === "ok" ? { status: "ok", note: nodeSummary(ev.output) } : { status: "error", note: String(ev.error ?? "It didn't work").replace(/^\w*Error:\s*/, "") })
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
  const flagged = (id: string) => problems.some((p) => p.where === id) || (!dirtySinceSave && engineIssues.some((i) => i.node === id))

  // A job may only use its Mind's tools: the skills it needs and doesn't have are added on Save.
  const usedTools = draft.steps.flatMap((s) => (s.kind === "tool" ? [s.tool] : s.kind === "http" ? ["http_request"] : []))
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
    if (drag.add === "if") return !draft.branch && resultsBefore(draft.steps).some(comparable) && at === draft.steps.length
    return true
  }
  const spot = (at: number) =>
    accepts(at) ? (
      <DropSpot key={`spot-${at}`} id={`spot-${at}`} over={over} setOver={setOver} onDrop={() => dropAt(at)} label={drag && "add" in drag && drag.add === "if" ? "Drop the If here" : "Drop here"} />
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
  function addIf() {
    const first = resultsBefore(draft.steps).find(comparable)
    const id = newId("check")
    setDraft((d) => ({
      ...d,
      branch: { id, stepId: first?.stepId ?? "", field: first?.name ?? "", op: first?.kind === "number" ? "lt" : "eq", right: "", then: { id: newId("yes"), kind: "agent", prompt: "" }, else: null },
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
      dropDraft(mindId, workflowId)
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
            return { node, text: (i.message ?? "Something in this job isn't allowed.").replace(/^node [\w-]+:\s*/, "") }
          })
        )
      } else {
        setSaveError("Couldn't save. Nothing changed; try again in a moment.")
      }
    }
  }

  const b = draft.branch
  const step = draft.steps.find((s) => s.id === selected)
  const ending = b && (selected === `${b.id}:then` ? "then" : selected === `${b.id}:else` ? "else" : null)
  const canIf = !b && resultsBefore(draft.steps).some(comparable)

  return (
    <div className="flex min-h-dvh min-w-0 flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <Button variant="ghost" size="icon" aria-label="Back to Autopilot" nativeButton={false} render={<Link href={mindHref(mindId, "autopilot")} />}>
          <ArrowLeftIcon />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold text-foreground">{draft.name.trim() || "Untitled job"}</span>
          <span className="text-xs text-muted-foreground">
            {dirty ? "Draft kept on this device, not saved yet" : !workflowId ? "Not saved yet" : "All changes saved"}
          </span>
        </div>
        {workflowId && (
          <Button
            variant="outline"
            onClick={() => void runTest()}
            disabled={Boolean(test?.running) || dirty || saving}
            title={dirty ? "Save your changes to test them" : "Runs the saved job once"}
          >
            {test?.running ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <FlaskConicalIcon />}
            {test?.running ? "Testing" : "Test run"}
          </Button>
        )}
        <Button onClick={() => void save()} disabled={saving || problems.length > 0 || (Boolean(workflowId) && !dirty)}>
          {saving && <Loader2Icon className="animate-spin motion-reduce:animate-none" />}
          Save
        </Button>
      </header>

      {kept && (
        <div role="status" className="mx-4 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-info-soft px-3.5 py-2.5 text-sm text-foreground md:mx-6">
          <span className="min-w-0 flex-1">You have unsaved changes from {timeAgo(kept.at)} on this device.</span>
          <Button
            size="sm"
            onClick={() => {
              setDraft(kept.draft)
              setKept(null)
            }}
          >
            Restore
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              dropDraft(mindId, workflowId)
              setKept(null)
            }}
          >
            Discard
          </Button>
        </div>
      )}
      {(engineIssues.length > 0 || saveError) && (
        <div role="alert" className="mx-4 mt-4 flex items-start gap-2.5 rounded-md bg-danger-soft px-3.5 py-3 text-sm text-foreground md:mx-6">
          <CircleXIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="flex flex-col gap-1">
            {saveError ?? "The job wasn't saved. Fix these first:"}
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
              ? "The test run didn't start. Try again in a moment."
              : test.status === "failed"
                ? "Test run finished: a block didn't work. It's marked in red."
                : "Test run finished. Each block shows what it did."}
          </span>
          <button type="button" className="shrink-0 text-xs font-medium underline underline-offset-2" onClick={() => setTest(null)}>
            Clear
          </button>
        </div>
      )}
      {dirty && workflowId && <p className="mx-4 mt-3 text-xs text-muted-foreground md:mx-6">Save your changes to test them.</p>}

      <TestRun.Provider value={withIf(test?.nodes ?? {}, draft.branch, Boolean(test && !test.running && !test.failed && test.status !== "failed"))}>
      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <aside className="flex flex-col gap-2 border-border p-4 lg:w-60 lg:shrink-0 lg:border-r">
          <h2 className="text-[13px] font-semibold text-foreground">Blocks</h2>
          <p className="text-xs text-muted-foreground">Drag one onto the canvas, or tap to add it at the end.</p>
          <PaletteItem icon={<CalendarClockIcon />} title="Start" line="Every job has one" disabled />
          <PaletteItem
            icon={<BotIcon />}
            title={`Ask ${name}`}
            line={`${name} writes or decides`}
            onClick={() => addStep("agent")}
            onDragStart={() => startDrag({ add: "agent" })}
            onDragEnd={endDrag}
          />
          <PaletteItem
            icon={<SearchIcon />}
            title="Use a tool"
            line="An account, the time, the calendar, the inbox"
            onClick={() => addStep("tool")}
            onDragStart={() => startDrag({ add: "tool" })}
            onDragEnd={endDrag}
          />
          <PaletteItem
            icon={<GitBranchIcon />}
            title="If or else"
            line={b ? "A job can have only one" : canIf ? "Choose one of two ways" : "Add a check or a website first"}
            onClick={addIf}
            disabled={!canIf}
            onDragStart={() => startDrag({ add: "if" })}
            onDragEnd={endDrag}
          />
          <PaletteItem
            icon={<GlobeIcon />}
            title="Call a website"
            line="Send to your own service"
            onClick={() => addStep("http")}
            onDragStart={() => startDrag({ add: "http" })}
            onDragEnd={endDrag}
          />
        </aside>

        <main
          aria-label="Job steps"
          onDragOver={(e) => drag && e.preventDefault()}
          className="flex min-w-0 flex-1 flex-col items-center overflow-x-auto bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[20px_20px] px-4 py-8"
        >
          <BlockCard icon={<CalendarClockIcon />} kind="Start" title={scheduleText(cronOf(draft))} line={`${zoneName(draft.timezone)} time`} active={selected === "start"} onClick={() => setSelected("start")} />
          {spot(0)}
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
                  <StepCard step={s} name={name} active={selected === s.id} problem={flagged(s.id)} onClick={() => setSelected(s.id)} />
                </div>
              </Linked>
              {spot(i + 1)}
            </div>
          ))}
          <Linked>
            <button
              type="button"
              onClick={() => addStep("agent")}
              className="flex w-full max-w-[280px] flex-col items-center gap-1 rounded-lg border border-dashed border-border-strong bg-surface/60 px-4 py-3 text-center outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus"
            >
              <PlusIcon className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Add the next step</span>
              <span className="text-xs text-muted-foreground">{b ? "It goes before the If" : `Ask ${name} to do something`}</span>
            </button>
          </Linked>
          {b && (
            <>
              <Linked>
                <BlockCard
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
                      <StepCard
                        step={b[h]!}
                        name={name}
                        active={selected === `${b.id}:${h}`}
                        problem={flagged(b[h]!.id) || (h === "then" && !b.then)}
                        onClick={() => setSelected(`${b.id}:${h}`)}
                      />
                    ) : (
                      <BlockCard
                        icon={<SquareIcon />}
                        kind={h === "then" ? "If yes" : "If no"}
                        title="Stop, nothing else runs"
                        active={selected === `${b.id}:${h}`}
                        dashed
                        onClick={() => setSelected(`${b.id}:${h}`)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </main>

        <aside className="flex flex-col gap-4 border-border p-4 lg:w-[340px] lg:shrink-0 lg:border-l">
          {step?.kind === "agent" ? (
            <AskPanel name={name} title={`Ask ${name}`} step={step} results={resultsBefore(draft.steps, draft.steps.indexOf(step))} onChange={(p) => setStep(step.id, { prompt: p })} onDelete={() => removeStep(step.id)} />
          ) : step?.kind === "http" ? (
            <HttpPanel
              step={step}
              results={resultsBefore(draft.steps, draft.steps.indexOf(step))}
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
              missingSkill={missingSkills.find((s) => catalog?.find((c) => c.skillId === s)?.tools.includes(step.tool))}
              onChange={(patch) => setStep(step.id, patch)}
              onDelete={() => removeStep(step.id)}
            />
          ) : b && selected === b.id ? (
            <IfPanel branch={b} steps={draft.steps} onChange={setBranch} onDelete={() => (set({ branch: null }), setSelected("start"))} />
          ) : b && ending ? (
            <EndingPanel
              name={name}
              which={ending}
              step={b[ending]}
              results={resultsBefore(draft.steps)}
              canAdd={ending === "then" || !b.then}
              onAdd={() => setBranch({ [ending]: { id: newId(ending === "then" ? "yes" : "no"), kind: "agent", prompt: "" } } as Partial<Branch>)}
              onChange={(p) => setBranch({ [ending]: { ...(b[ending] as AskStep), prompt: p } } as Partial<Branch>)}
              onRemove={() => setBranch({ [ending]: null } as Partial<Branch>)}
            />
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
          {problems.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md bg-muted p-3 text-xs text-muted-foreground">
              {problems.map((p) => (
                <li key={`${p.where}${p.text}`}>{p.text}</li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      </TestRun.Provider>
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

/** A place a dragged block may land (B1.7): + marks it, and it turns dark while hovered. */
function DropSpot({ id, over, setOver, onDrop, label }: { id: string; over: string | null; setOver: (id: string | null) => void; onDrop: () => void; label: string }) {
  const hot = over === id
  return (
    <div className="flex flex-col items-center">
      <span aria-hidden className="h-3 w-px bg-border-strong" />
      <div
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
        className={cn(
          "flex h-10 w-[220px] max-w-full items-center justify-center gap-1.5 rounded-full border border-dashed text-xs transition-colors duration-100 ease-out",
          hot ? "border-foreground bg-foreground text-background" : "border-border-strong bg-surface/80 text-muted-foreground"
        )}
      >
        <PlusIcon className="size-3.5" />
        {label}
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

function StepCard({ step, name, active, problem, onClick }: { step: Step; name: string; active: boolean; problem: boolean; onClick: () => void }) {
  if (step.kind === "agent") {
    return (
      <BlockCard
        icon={<BotIcon />}
        kind={`Ask ${name}`}
        nodeId={step.id}
        title={step.prompt.trim() ? short(step.prompt.replace(/\{\{[^}]*\}\}/g, "...")) : "Say what to do"}
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
  return (
    <BlockCard
      icon={<SearchIcon />}
      kind="Use a tool"
      nodeId={step.id}
      title={info?.title ?? "A tool"}
      line={account ? shortAddress(account) : info?.line}
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
}: {
  icon: ReactNode
  kind: string
  title: string
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
        "flex w-[280px] max-w-full flex-col gap-1 rounded-lg border bg-surface px-4 py-3 text-left shadow-xs outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-focus",
        dashed && "border-dashed bg-surface/60",
        run?.status === "running"
          ? "border-info ring-2 ring-info/30"
          : run?.status === "ok"
            ? "border-success"
            : run?.status === "error"
              ? "border-danger"
              : active
                ? "border-foreground"
                : warn
                  ? "border-warning"
                  : "border-border hover:bg-surface-hover"
      )}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground [&>svg]:size-3.5">
        {icon}
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
}: {
  icon: ReactNode
  title: string
  line: string
  onClick?: () => void
  disabled?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
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
      className="flex items-center gap-3 rounded-md bg-muted px-3 py-2.5 text-left outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface text-foreground [&>svg]:size-4">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{line}</span>
      </span>
    </button>
  )
}

const field = "flex flex-col gap-1.5"
const label = "text-[13px] font-medium text-foreground"
const selectCls = "h-11 w-full rounded-md border border-input bg-surface px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus md:text-sm"

function PanelHead({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-sm bg-muted text-foreground [&>svg]:size-4">{icon}</span>
      <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
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
      <label className={field}>
        <span className={label}>Runs</span>
        <select className={selectCls} value={draft.repeat} onChange={(e) => set({ repeat: e.target.value as Repeat })}>
          <option value="daily">Every day</option>
          <option value="weekdays">Weekdays</option>
          <option value="weekly">Once a week</option>
        </select>
      </label>
      {draft.repeat === "weekly" && (
        <label className={field}>
          <span className={label}>On</span>
          <select className={selectCls} value={draft.day} onChange={(e) => set({ day: Number(e.target.value) })}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={field}>
        <span className={label}>At</span>
        <Input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} />
      </label>
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
}: {
  name: string
  value: string
  results: Result[]
  onChange: (p: string) => void
  labelText?: string
  placeholder?: string
}) {
  return (
    <label className={field}>
      <span className={label}>{labelText ?? `What should ${name} do?`}</span>
      <Textarea value={value} maxLength={PROMPT_MAX} rows={6} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {results.length > 0 && (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Put in a result:
          {results.map((r) => (
            <button
              key={`${r.stepId}.${r.name}`}
              type="button"
              onClick={() => onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${ref(r.stepId, r.name)}`)}
              className="rounded-full bg-muted px-2 py-0.5 text-foreground outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
            >
              {r.label}
            </button>
          ))}
        </span>
      )}
      <span className="text-xs text-muted-foreground">{name} uses the skills it has. It can&apos;t pay, ask you to approve, or use keys while it runs alone.</span>
    </label>
  )
}

function AskPanel({ name, title, step, results, onChange, onDelete }: { name: string; title: string; step: AskStep; results: Result[]; onChange: (p: string) => void; onDelete: () => void }) {
  return (
    <>
      <PanelHead icon={<BotIcon />} title={title} />
      <PromptField name={name} value={step.prompt} results={results} onChange={onChange} />
      <DeleteBlock onClick={onDelete} />
    </>
  )
}

function ToolPanel({
  step,
  address,
  name,
  missingSkill,
  onChange,
  onDelete,
}: {
  step: Extract<Step, { kind: "tool" }>
  address: string
  name: string
  missingSkill?: string
  onChange: (patch: Partial<Step>) => void
  onDelete: () => void
}) {
  const info = toolInfo(step.tool)
  return (
    <>
      <PanelHead icon={<SearchIcon />} title="Use a tool" />
      <label className={field}>
        <span className={label}>Tool</span>
        <select
          className={selectCls}
          value={step.tool}
          onChange={(e) => onChange({ tool: e.target.value, args: e.target.value === "near_view_account" ? { accountId: address } : {} })}
        >
          {TOOLS.map((t) => (
            <option key={t.tool} value={t.tool}>
              {t.title}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{info?.line}</span>
      </label>
      {info?.args.map((a) => (
        <label key={a.name} className={field}>
          <span className={label}>{a.label}</span>
          <Input
            value={step.args[a.name] ?? ""}
            placeholder="shop.testnet"
            className="font-mono"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => onChange({ args: { ...step.args, [a.name]: e.target.value.trim().toLowerCase() } })}
          />
          {address && step.args[a.name] !== address && (
            <button type="button" className="w-fit text-xs font-medium text-foreground underline underline-offset-2" onClick={() => onChange({ args: { ...step.args, [a.name]: address } })}>
              Use {name}&apos;s own wallet
            </button>
          )}
        </label>
      ))}
      {missingSkill && <p className="text-xs text-muted-foreground">This tool comes with {skillCopy(missingSkill).title}. Saving adds that skill to {name}.</p>}
      <DeleteBlock onClick={onDelete} />
    </>
  )
}

function IfPanel({ branch, steps, onChange, onDelete }: { branch: Branch; steps: Step[]; onChange: (p: Partial<Branch>) => void; onDelete: () => void }) {
  const results = resultsBefore(steps).filter(comparable)
  const current = results.find((r) => r.stepId === branch.stepId && r.name === branch.field)
  const ops = OPS.filter((o) => current?.kind === "number" || !o.number)
  return (
    <>
      <PanelHead icon={<GitBranchIcon />} title="If or else" />
      <label className={field}>
        <span className={label}>Look at</span>
        <select
          className={selectCls}
          value={current ? `${current.stepId}|${current.name}` : ""}
          onChange={(e) => {
            const [stepId, f] = e.target.value.split("|")
            const r = results.find((x) => x.stepId === stepId && x.name === f)
            onChange({ stepId, field: f, op: r?.kind === "number" ? "lt" : "eq", right: "" })
          }}
        >
          {!current && <option value="">Pick a result</option>}
          {results.map((r) => (
            <option key={`${r.stepId}|${r.name}`} value={`${r.stepId}|${r.name}`}>
              {r.label}, from {r.step}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">Pick a result from an earlier block.</span>
      </label>
      <label className={field}>
        <span className={label}>Is</span>
        <select className={selectCls} value={branch.op} onChange={(e) => onChange({ op: e.target.value as Op })}>
          {ops.map((o) => (
            <option key={o.op} value={o.op}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        <span className={label}>{current?.kind === "number" ? "This number" : "This text"}</span>
        <Input
          value={branch.right}
          inputMode={current?.kind === "number" ? "decimal" : "text"}
          placeholder={current?.kind === "number" ? "5" : current?.name === "weekday" ? "Friday" : ""}
          onChange={(e) => onChange({ right: e.target.value })}
        />
      </label>
      <p className="text-xs text-muted-foreground">Then pick what happens for yes and for no on the canvas.</p>
      <DeleteBlock onClick={onDelete} />
    </>
  )
}

function EndingPanel({
  name,
  which,
  step,
  results,
  onAdd,
  canAdd,
  onChange,
  onRemove,
}: {
  name: string
  which: "then" | "else"
  step: AskStep | null
  results: Result[]
  canAdd: boolean
  onAdd: () => void
  onChange: (p: string) => void
  onRemove: () => void
}) {
  const title = which === "then" ? "If yes" : "If no"
  if (!step) {
    return (
      <>
        <PanelHead icon={<SquareIcon />} title={title} />
        <p className="text-sm text-muted-foreground">Nothing else runs. The job stops here.</p>
        {canAdd ? (
          <Button variant="outline" className="w-fit" onClick={onAdd}>
            <PlusIcon />
            Ask {name} to do something
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">A job can ask {name} on only one of the two ways, and If yes already does.</p>
        )}
      </>
    )
  }
  return (
    <>
      <PanelHead icon={<BotIcon />} title={`${title}: ask ${name}`} />
      <PromptField name={name} value={step.prompt} results={results} onChange={onChange} />
      <DeleteBlock onClick={onRemove}>{which === "then" ? "Delete this block" : "Stop here instead"}</DeleteBlock>
    </>
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
      <PanelHead icon={<GlobeIcon />} title="Call a website" />
      <label className={field}>
        <span className={label}>Do</span>
        <select className={selectCls} value={step.method} onChange={(e) => onChange({ method: e.target.value as HttpStep["method"] })}>
          <option value="GET">Read from it (GET)</option>
          <option value="POST">Send to it (POST)</option>
        </select>
      </label>
      <label className={field}>
        <span className={label}>Address</span>
        <Input value={step.url} placeholder="https://example.com/status" autoCapitalize="none" spellCheck={false} onChange={(e) => onChange({ url: e.target.value })} />
      </label>
      <label className={field}>
        <span className={label}>Key</span>
        <select className={selectCls} value={step.key} onChange={(e) => onChange({ key: e.target.value })}>
          <option value="">No key</option>
          {keys.map((k) => (
            <option key={k.name} value={k.name}>
              {k.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {step.key
            ? "Sent as Authorization: Bearer, only to the sites the key allows. A job with a key runs with Run now, but can't run on a schedule yet."
            : keys.length
              ? "Pick a key saved in Connections if the site needs one."
              : "Keys you save in Connections show up here."}
        </span>
      </label>
      {step.method === "POST" && <PromptField name={name} value={step.body} results={results} onChange={(body) => onChange({ body })} labelText="What to send" placeholder="Balance is low: please top up." />}
      {missingSkill && <p className="text-xs text-muted-foreground">Websites come with {skillCopy(missingSkill).title}. Saving adds that skill to {name}.</p>}
      <DeleteBlock onClick={onDelete} />
    </>
  )
}
