"use client"

import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon, BotIcon, CalendarClockIcon, CircleXIcon, GitBranchIcon, Loader2Icon, PlusIcon, SearchIcon, SquareIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { cn } from "cn"
import { mindHref } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { autopilotApi } from "@/modules/autopilot/api"
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
  resultsBefore,
  toCanvas,
  workflowIdFor,
  type AskStep,
  type Branch,
  type Draft,
  type Op,
  type Repeat,
  type Step,
} from "@/modules/builder/data/draft"
import { fieldInfo, toolInfo, TOOLS } from "@/modules/builder/data/tools"
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
  const [selected, setSelected] = useState<string>("start")
  const [saving, setSaving] = useState(false)
  const [engineIssues, setEngineIssues] = useState<string[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const problems = draftProblems(draft)

  // A job may only use its Mind's tools: the skills it needs and doesn't have are added on Save.
  const usedTools = draft.steps.flatMap((s) => (s.kind === "tool" ? [s.tool] : []))
  const missingSkills = [...new Set(usedTools.map((t) => catalog?.find((s) => s.tools.includes(t))?.skillId).filter((s): s is string => Boolean(s)))].filter(
    (s) => mind && !mind.skills.includes(s)
  )

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setStep = (id: string, patch: Partial<Step>) => setDraft((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? ({ ...s, ...patch } as Step) : s)) }))
  const setBranch = (patch: Partial<Branch>) => setDraft((d) => (d.branch ? { ...d, branch: { ...d.branch, ...patch } } : d))

  function addStep(kind: "agent" | "tool") {
    const id = newId(kind === "agent" ? "ask" : "tool")
    const step: Step = kind === "agent" ? { id, kind, prompt: "" } : { id, kind, tool: TOOLS[0].tool, args: { accountId: address } }
    setDraft((d) => ({ ...d, steps: [...d.steps, step] }))
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
        // The engine names blocks by their ids; the message alone reads better here.
        setEngineIssues(issues.map((i) => (i.message ?? "Something in this job isn't allowed.").replace(/^node [\w-]+:\s*/, "")))
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
    <div className="flex min-h-[calc(100dvh-64px)] min-w-0 flex-col md:min-h-dvh">
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

      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <aside className="flex flex-col gap-2 border-border p-4 lg:w-60 lg:shrink-0 lg:border-r">
          <h2 className="text-[13px] font-semibold text-foreground">Blocks</h2>
          <p className="text-xs text-muted-foreground">Tap one to add it.</p>
          <PaletteItem icon={<CalendarClockIcon />} title="Start" line="Every job has one" disabled />
          <PaletteItem icon={<BotIcon />} title={`Ask ${name}`} line={`${name} writes or decides`} onClick={() => addStep("agent")} />
          <PaletteItem icon={<SearchIcon />} title="Use a tool" line="An account, the time, the calendar, the inbox" onClick={() => addStep("tool")} />
          <PaletteItem
            icon={<GitBranchIcon />}
            title="If or else"
            line={b ? "A job can have only one" : canIf ? "Choose one of two ways" : "Add an account or time check first"}
            onClick={addIf}
            disabled={!canIf}
          />
          <p className="pt-2 text-xs text-muted-foreground">Calling a website comes next.</p>
        </aside>

        <main
          aria-label="Job steps"
          className="flex min-w-0 flex-1 flex-col items-center overflow-x-auto bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[20px_20px] px-4 py-8"
        >
          <BlockCard icon={<CalendarClockIcon />} kind="Start" title={scheduleText(cronOf(draft))} line={`${zoneName(draft.timezone)} time`} active={selected === "start"} onClick={() => setSelected("start")} />
          {draft.steps.map((s) => (
            <Linked key={s.id}>
              <StepCard step={s} name={name} active={selected === s.id} problem={problems.some((p) => p.where === s.id)} onClick={() => setSelected(s.id)} />
            </Linked>
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
                  title={ifTitle(b, draft.steps)}
                  active={selected === b.id}
                  warn={problems.some((p) => p.where === b.id)}
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
                        problem={problems.some((p) => p.where === b[h]!.id) || (h === "then" && !b.then)}
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
    </div>
  )
}

function ifTitle(b: Branch, steps: Step[]): string {
  const step = steps.find((s) => s.id === b.stepId)
  const field = step?.kind === "tool" ? fieldInfo(step.tool, b.field) : null
  if (!field || !b.right.trim()) return "Pick what to check"
  // "If balance is less than 5 NEAR", "If weekday is Friday", "If weekday is not Sunday".
  const label = OPS.find((o) => o.op === b.op)?.label ?? b.op
  const verb = label.startsWith("is") ? label : `is ${label}`
  const what = field.label.replace(/ \(.*\)$/, "").toLowerCase()
  return `If ${what} ${verb} ${b.right.trim()}${field.name === "balanceNear" ? " NEAR" : ""}`
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
        title={step.prompt.trim() ? short(step.prompt.replace(/\{\{[^}]*\}\}/g, "...")) : "Say what to do"}
        line={step.prompt.trim() ? undefined : "Not set yet"}
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
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-[280px] max-w-full flex-col gap-1 rounded-lg border bg-surface px-4 py-3 text-left shadow-xs outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-focus",
        dashed && "border-dashed bg-surface/60",
        active ? "border-foreground" : warn ? "border-warning" : "border-border hover:bg-surface-hover"
      )}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground [&>svg]:size-3.5">
        {icon}
        {kind}
      </span>
      <span className="text-sm font-semibold break-words text-foreground">{title}</span>
      {line && <span className={cn("text-xs text-muted-foreground", mono && "font-mono")}>{line}</span>}
    </button>
  )
}

function PaletteItem({ icon, title, line, onClick, disabled }: { icon: ReactNode; title: string; line: string; onClick?: () => void; disabled?: boolean }) {
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

function PromptField({ name, value, results, onChange }: { name: string; value: string; results: Result[]; onChange: (p: string) => void }) {
  return (
    <label className={field}>
      <span className={label}>What should {name} do?</span>
      <Textarea value={value} maxLength={PROMPT_MAX} rows={6} placeholder="Sum up the emails that need me today, in three lines." onChange={(e) => onChange(e.target.value)} />
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
