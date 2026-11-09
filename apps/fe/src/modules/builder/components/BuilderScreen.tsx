"use client"

import { ArrowLeftIcon, BotIcon, CalendarClockIcon, CircleXIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { cn } from "cn"
import { mindHref } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { autopilotApi } from "@/modules/autopilot/api"
import { scheduleText, zoneName } from "@/modules/autopilot/data/schedule"
import { useWorkflow, useWorkflows } from "@/modules/autopilot/hooks/useAutopilot"
import { cronOf, draftProblems, emptyDraft, fromCanvas, NAME_MAX, PROMPT_MAX, toCanvas, workflowIdFor, type Draft, type Repeat } from "@/modules/builder/data/draft"
import { useMind } from "@/modules/minds/hooks/useMinds"
import { useQueryClient } from "@tanstack/react-query"
import { autopilotKeys } from "@/modules/autopilot/hooks/useAutopilot"

const ZONE = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/**
 * Builder (design "7 · Automations" B1.0, B1.1; #20), stage 1 (9 Nov, with Ancung): a Start block
 * and "Ask {Mind}" steps in a line, set from the panel on the right, saved as the engine's canvas.
 * Tools, If, websites, Test run and dragging come in later stages. Opens from Autopilot (New job,
 * Edit steps); a job with blocks this stage can't show isn't opened here.
 */
export function BuilderScreen({ mindId, workflowId }: { mindId: string; workflowId: string | null }) {
  const existing = useWorkflow(mindId, workflowId)
  if (workflowId && existing.isPending) return <Skeleton className="m-6 h-[480px] rounded-lg" />
  if (workflowId && !existing.data) return <Gone mindId={mindId} text="This job couldn't be loaded." />
  const draft = existing.data ? fromCanvas(existing.data.canvas, ZONE()) : emptyDraft(ZONE())
  if (!draft) return <Gone mindId={mindId} text="This job has blocks the Builder can't show yet (tools or an If). It still runs; you can run it from Autopilot." />
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

let nextStep = 0
const newStepId = () => `ask-${Date.now().toString(36)}-${nextStep++}`

function Editor({ mindId, workflowId, initial }: { mindId: string; workflowId: string | null; initial: Draft }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const name = useMind(mindId).data?.name ?? "Your Mind"
  const jobs = useWorkflows(mindId)
  const [draft, setDraft] = useState<Draft>(initial)
  const [selected, setSelected] = useState<string>("start")
  const [saving, setSaving] = useState(false)
  const [engineIssues, setEngineIssues] = useState<string[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const problems = draftProblems(draft)

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setPrompt = (id: string, prompt: string) => setDraft((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, prompt } : s)) }))
  function addAsk() {
    const id = newStepId()
    setDraft((d) => ({ ...d, steps: [...d.steps, { id, kind: "agent", prompt: "" }] }))
    setSelected(id)
  }
  function removeStep(id: string) {
    setDraft((d) => ({ ...d, steps: d.steps.filter((s) => s.id !== id) }))
    setSelected("start")
  }

  async function save() {
    setSaving(true)
    setEngineIssues([])
    setSaveError(null)
    const id = workflowId ?? workflowIdFor(draft.name, jobs.data?.map((j) => j.workflowId) ?? [])
    try {
      await autopilotApi.save(mindId, id, toCanvas(draft))
      await queryClient.invalidateQueries({ queryKey: autopilotKeys.list(mindId) })
      await queryClient.invalidateQueries({ queryKey: autopilotKeys.one(mindId, id) })
      router.push(`${mindHref(mindId, "autopilot")}?job=${encodeURIComponent(id)}`)
    } catch (err) {
      setSaving(false)
      if (err instanceof ApiError && err.code === "invalid_workflow") {
        const issues = (err.details.issues as { path?: string; message?: string }[] | undefined) ?? []
        setEngineIssues(issues.map((i) => (i.path ? `${i.path}: ${i.message}` : (i.message ?? "Something in this job isn't allowed."))))
      } else {
        setSaveError("Couldn't save. Nothing changed; try again in a moment.")
      }
    }
  }

  const step = draft.steps.find((s) => s.id === selected)

  return (
    <div className="flex min-h-[calc(100dvh-64px)] flex-col md:min-h-dvh">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <Button variant="ghost" size="icon" aria-label="Back to Autopilot" nativeButton={false} render={<Link href={mindHref(mindId, "autopilot")} />}>
          <ArrowLeftIcon />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold text-foreground">{draft.name.trim() || "Untitled job"}</span>
          <span className="text-xs text-muted-foreground">{!workflowId ? "Not saved yet" : dirty ? "Changes not saved" : "All changes saved"}</span>
        </div>
        <Button onClick={() => void save()} disabled={saving || problems.length > 0 || (Boolean(workflowId) && !dirty)}>
          {saving && <Loader2Icon className="animate-spin motion-reduce:animate-none" />}
          Save
        </Button>
      </header>

      {(engineIssues.length > 0 || saveError) && (
        <div role="alert" className="mx-4 mt-4 flex items-start gap-2.5 rounded-md bg-danger-soft px-3.5 py-3 text-sm text-foreground md:mx-6">
          <CircleXIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="flex flex-col gap-1">
            {saveError ?? "The job wasn't saved. Fix these first:"}
            {engineIssues.length > 0 && (
              <ul className="list-disc pl-4 text-[13px]">
                {engineIssues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="flex flex-col gap-2 border-border p-4 lg:w-60 lg:shrink-0 lg:border-r">
          <h2 className="text-[13px] font-semibold text-foreground">Blocks</h2>
          <p className="text-xs text-muted-foreground">Tap one to add it after the last step.</p>
          <PaletteItem icon={<CalendarClockIcon />} title="Start" line="When it runs" disabled note="Every job has one" />
          <PaletteItem icon={<BotIcon />} title={`Ask ${name}`} line={`${name} writes or decides`} onClick={addAsk} />
          <p className="pt-2 text-xs text-muted-foreground">Tools, websites and If or else are coming next.</p>
        </aside>

        <main
          aria-label="Job steps"
          className="flex flex-1 flex-col items-center gap-0 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[20px_20px] px-4 py-8"
        >
          <BlockCard
            icon={<CalendarClockIcon />}
            kind="Start"
            title={scheduleText(cronOf(draft))}
            line={`${zoneName(draft.timezone)} time`}
            active={selected === "start"}
            onClick={() => setSelected("start")}
          />
          {draft.steps.map((s) => (
            <div key={s.id} className="flex flex-col items-center">
              <Connector />
              <BlockCard
                icon={<BotIcon />}
                kind={`Ask ${name}`}
                title={s.prompt.trim() ? short(s.prompt) : "Say what to do"}
                line={s.prompt.trim() ? undefined : "Not set yet"}
                active={selected === s.id}
                warn={!s.prompt.trim()}
                onClick={() => setSelected(s.id)}
              />
            </div>
          ))}
          <Connector />
          <button
            type="button"
            onClick={addAsk}
            className="flex w-full max-w-[280px] flex-col items-center gap-1 rounded-lg border border-dashed border-border-strong bg-surface/60 px-4 py-4 text-center outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus"
          >
            <PlusIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Add the next step</span>
            <span className="text-xs text-muted-foreground">Ask {name} to do something</span>
          </button>
        </main>

        <aside className="flex flex-col gap-4 border-border p-4 lg:w-[340px] lg:shrink-0 lg:border-l">
          {step ? (
            <StepPanel name={name} prompt={step.prompt} onPrompt={(p) => setPrompt(step.id, p)} onDelete={() => removeStep(step.id)} />
          ) : (
            <StartPanel draft={draft} set={set} />
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
    </div>
  )
}

const short = (s: string) => (s.trim().length > 60 ? `${s.trim().slice(0, 60)}...` : s.trim())

function Connector() {
  return <span aria-hidden className="h-6 w-px bg-border-strong" />
}

function BlockCard({
  icon,
  kind,
  title,
  line,
  active,
  warn,
  onClick,
}: {
  icon: React.ReactNode
  kind: string
  title: string
  line?: string
  active: boolean
  warn?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-[280px] max-w-full flex-col gap-1 rounded-lg border bg-surface px-4 py-3 text-left shadow-xs outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-focus",
        active ? "border-foreground" : warn ? "border-warning" : "border-border hover:bg-surface-hover"
      )}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground [&>svg]:size-3.5">
        {icon}
        {kind}
      </span>
      <span className="text-sm font-semibold break-words text-foreground">{title}</span>
      {line && <span className="text-xs text-muted-foreground">{line}</span>}
    </button>
  )
}

function PaletteItem({
  icon,
  title,
  line,
  onClick,
  disabled,
  note,
}: {
  icon: React.ReactNode
  title: string
  line: string
  onClick?: () => void
  disabled?: boolean
  note?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 rounded-md bg-muted px-3 py-2.5 text-left outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface text-foreground [&>svg]:size-4">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{note ?? line}</span>
      </span>
    </button>
  )
}

const field = "flex flex-col gap-1.5"
const label = "text-[13px] font-medium text-foreground"
const selectCls =
  "h-11 w-full rounded-md border border-input bg-surface px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus md:text-sm"

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

function StepPanel({ name, prompt, onPrompt, onDelete }: { name: string; prompt: string; onPrompt: (p: string) => void; onDelete: () => void }) {
  return (
    <>
      <PanelHead icon={<BotIcon />} title={`Ask ${name}`} />
      <label className={field}>
        <span className={label}>What should {name} do?</span>
        <Textarea
          value={prompt}
          maxLength={PROMPT_MAX}
          rows={6}
          autoFocus
          placeholder="Sum up the emails that need me today, in three lines."
          onChange={(e) => onPrompt(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          {name} uses the skills it has. It can&apos;t pay, ask you to approve, or use keys while it runs alone.
        </span>
      </label>
      <Button variant="outline" className="w-fit text-danger" onClick={onDelete}>
        <Trash2Icon />
        Delete this block
      </Button>
    </>
  )
}

function PanelHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-sm bg-muted text-foreground [&>svg]:size-4">{icon}</span>
      <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
    </div>
  )
}
