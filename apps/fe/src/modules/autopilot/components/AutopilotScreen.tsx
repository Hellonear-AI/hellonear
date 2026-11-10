"use client"

import {
  BotIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronDownIcon,
  GitBranchIcon,
  OctagonXIcon,
  GlobeIcon,
  InfoIcon,
  Loader2Icon,
  EllipsisIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { cn } from "cn"
import { PageTitle } from "@/components/elements/PageTitle"
import { mindHref } from "@/components/layout/nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { isApiCode } from "@/lib/api"
import { shortWhen, clockTime } from "@/lib/format"
import { browserTimeZone } from "@/lib/stream"
import { TryOutLockedDialog, useTryOutLock } from "@/modules/auth/components/TryOutLockedDialog"
import { useSession } from "@/modules/auth/hooks/useSession"
import { autopilotApi, type ApiWorkflow, type AutopilotIssue, type WorkflowRun } from "@/modules/autopilot/api"
import { IDEAS, type Idea } from "@/modules/autopilot/data/ideas"
import { runSummary, runText } from "@/modules/autopilot/data/runs"
import { nodeSummary } from "@/modules/builder/data/testRun"
import { ReplyText } from "@/modules/chat/components/ReplyText"
import { scheduleText, whenNext, zoneName } from "@/modules/autopilot/data/schedule"
import { flatSteps, jobTree, type JobStep } from "@/modules/autopilot/data/steps"
import { fromCanvas } from "@/modules/builder/data/draft"
import { TONE, TONE_OF_NODE } from "@/modules/builder/data/tone"
import { PromptPreview } from "@/modules/builder/components/PromptText"
import { useAddJob, useAutopilotState, useRemoveJob, useSetAutopilot, useWorkflow, useWorkflowRuns, useWorkflows } from "@/modules/autopilot/hooks/useAutopilot"
import { useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"
import { skillCopy } from "@/modules/skills/data/skills"
import { useSetSkills } from "@/modules/skills/hooks/useSkills"

/**
 * Autopilot (design "7 · Automations", P1.1 to P1.6, #21): jobs a Mind runs on a schedule with
 * nobody watching. Jobs come from the two ready ideas (P1.2) until the Builder (#20) exists, so
 * "New job" and "Edit steps" aren't shown yet. A try-out can save and run a job by hand, but
 * turning a schedule on needs an account (`demo_not_allowed`, T1.4).
 */
export function AutopilotScreen({ mindId }: { mindId: string }) {
  const mind = useMind(mindId).data
  const name = mind?.name ?? "Your Mind"
  const demo = Boolean(useSession().data?.demo)
  const jobs = useWorkflows(mindId)
  const locked = useTryOutLock()
  // Back from the Builder with ?job=… opens the job just saved.
  const [picked, setPicked] = useState<string | null>(useSearchParams().get("job"))
  const selected = picked && jobs.data?.some((j) => j.workflowId === picked) ? picked : (jobs.data?.[0]?.workflowId ?? null)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 xl:p-8">
      <PageTitle
        title="Autopilot"
        description={`Jobs ${name} runs on a schedule, with nobody watching.`}
        actions={
          <Button nativeButton={false} render={<Link href={`${mindHref(mindId, "autopilot")}/new`} />}>
            <PlusIcon />
            New job
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-md bg-info-soft px-4 py-3 text-[13px] text-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-info" />
        <p>Jobs run alone, so they can&apos;t send money or ask you to approve, and can&apos;t use keys yet. Results show here, without a verification badge.</p>
      </div>

      {jobs.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-6 xl:flex-row">
          <Skeleton className="h-64 w-full rounded-lg xl:w-[340px]" />
          <Skeleton className="h-96 flex-1 rounded-lg" />
        </div>
      ) : jobs.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-5">
          <p className="text-sm text-muted-foreground">Could not load {name}&apos;s jobs. Please try again later.</p>
          <Button variant="outline" onClick={() => void jobs.refetch()}>
            Try again
          </Button>
        </div>
      ) : !jobs.data?.length ? (
        <NoJobs mindId={mindId} name={name} demo={demo} onAdded={setPicked} />
      ) : (
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <ul className="flex flex-col gap-2 xl:sticky xl:top-8 xl:w-[340px] xl:shrink-0">
            {jobs.data.map((j) => (
              <JobCard
                key={j.workflowId}
                mindId={mindId}
                name={name}
                job={j}
                active={j.workflowId === selected}
                onPick={() => setPicked(j.workflowId)}
                onLocked={() => locked.lock("autopilot")}
                demo={demo}
              />
            ))}
            <Ideas mindId={mindId} name={name} demo={demo} taken={jobs.data.map((j) => j.workflowId)} onAdded={setPicked} compact />
          </ul>
          {selected && <JobDetail key={selected} mindId={mindId} name={name} workflowId={selected} />}
        </div>
      )}

      <TryOutLockedDialog action={locked.action} name={name} onClose={locked.close} />
    </div>
  )
}

/** What the engine said can't run unattended (P1.4), in the owner's words. */
export function issueText(issue: AutopilotIssue, name: string): string {
  switch (issue.code) {
    case "uses_secrets":
      return "This job sends a key to a website. Jobs that run alone can't use keys yet, so it can't be turned on."
    case "missing_tools":
      return `${name} no longer has a skill this job uses. Add it back in Skills, then turn the job on.`
    case "no_schedule":
      return "This job has no schedule, so it can only run by hand."
    case "invalid_schedule":
      return "This job's schedule isn't valid."
    case "invalid_input":
      return "This job needs inputs it doesn't have."
    default:
      return issue.message
  }
}

function JobCard({
  mindId,
  name,
  job,
  active,
  demo,
  onPick,
  onLocked,
}: {
  mindId: string
  name: string
  job: ApiWorkflow
  active: boolean
  demo: boolean
  onPick: () => void
  onLocked: () => void
}) {
  const state = useAutopilotState(mindId, job.workflowId)
  const set = useSetAutopilot(mindId, job.workflowId)
  const autopilot = state.data ?? null
  const on = autopilot?.status === "active"
  const refused = isApiCode(set.error, "cannot_autopilot") ? ((set.error.details.issues as AutopilotIssue[]) ?? []) : []
  const paused = autopilot?.status === "paused" && autopilot.pausedFor.length ? autopilot.pausedFor : []
  const problems = refused.length ? refused : paused
  const next = on ? whenNext(autopilot?.nextFireAt) : null

  return (
    <li>
      <div
        className={cn(
          "flex flex-col gap-2 rounded-lg border bg-surface p-4 transition-colors duration-150 ease-out",
          active ? "border-foreground" : "border-border hover:bg-surface-hover"
        )}
      >
        <div className="flex items-start gap-3">
          <button type="button" onClick={onPick} className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-focus">
            <span className="truncate text-sm font-semibold text-foreground">{job.name}</span>
            <span className="text-[13px] text-muted-foreground">{scheduleText(job.schedule?.cron)}</span>
          </button>
          <Switch
            checked={on}
            disabled={state.isPending || set.isPending}
            aria-label={on ? `Pause ${job.name}` : `Turn on ${job.name}`}
            onCheckedChange={(checked) => (demo ? onLocked() : set.mutate(checked))}
          />
        </div>
        {problems.length > 0 ? (
          <p className="flex items-start gap-2 text-xs text-foreground">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-warning" />
            {issueText(problems[0], name)}
          </p>
        ) : next ? (
          <p className="text-xs text-muted-foreground">Next: {next}</p>
        ) : !on ? (
          <p className="text-xs text-muted-foreground">Off. It only runs when you press Run now.</p>
        ) : null}
        {set.error && !refused.length && <p className="text-xs text-danger">Could not change it. Please try again later.</p>}
      </div>
    </li>
  )
}

const STEP_ICON: Record<JobStep["kind"], typeof BotIcon> = {
  trigger: CalendarClockIcon,
  tool: SearchIcon,
  http: GlobeIcon,
  condition: GitBranchIcon,
  agent: BotIcon,
  end: OctagonXIcon,
}

function JobDetail({ mindId, name, workflowId }: { mindId: string; name: string; workflowId: string }) {
  const detail = useWorkflow(mindId, workflowId)
  const [running, setRunning] = useState(false)
  // The id of the run Run now started (from its first event): once the list has it, its own row
  // takes the place of the "Now" row, so the run never shows twice (Ancung, 10 Nov).
  const [myRun, setMyRun] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const runs = useWorkflowRuns(mindId, workflowId, running)
  const remove = useRemoveJob(mindId)
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  async function runNow() {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setRunning(true)
    setRunError(null)
    setMyRun(null)
    try {
      // The run's own record (GET …/runs) is what the list shows; the stream only says when it ends.
      await autopilotApi.runNow(mindId, workflowId, (e) => e.runId && setMyRun((id) => id ?? e.runId), controller.signal)
    } catch (err) {
      if (!controller.signal.aborted) {
        setRunError(
          isApiCode(err, "missing_tools")
            ? `${name} doesn't have a skill this job uses. Add it in Skills first.`
            : isApiCode(err, "demo_run_limit")
              ? "That's all the messages this try-out has."
              : "The job did not start. Please try again later."
        )
      }
    }
    if (controller.signal.aborted) return
    setRunning(false)
    void runs.refetch()
  }

  const canvas = detail.data?.canvas
  const wallet = useMindWallet(mindId).data
  const tree = canvas ? jobTree(canvas, name, wallet?.address) : []
  const steps = flatSteps(tree)
  const [openRun, setOpenRun] = useState<string | null>(null)
  const editable = Boolean(canvas && fromCanvas(canvas, "UTC"))
  const editHref = `${mindHref(mindId, "autopilot")}/${encodeURIComponent(workflowId)}`
  const trigger = canvas?.nodes.find((n) => n.type === "trigger")
  const schedule = trigger?.type === "trigger" ? trigger.data.schedule : undefined

  return (
    <section aria-labelledby="job" className="flex min-w-0 flex-1 flex-col gap-5 rounded-lg border border-border bg-surface p-5">
      {detail.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : !detail.data ? (
        <p className="text-sm text-muted-foreground">Could not load this job.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id="job" className="text-lg font-semibold text-foreground">
                {detail.data.name}
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {scheduleText(schedule?.cron)} ({zoneName(schedule?.timezone)} time).
              </p>
            </div>
            {/* One main action, the rest in a menu (Ancung, 10 Nov: three buttons were too many). */}
            <div className="flex shrink-0 items-center gap-2">
              <Button onClick={() => void runNow()} disabled={running}>
                {running ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <PlayIcon />}
                {running ? "Running" : "Run now"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon" aria-label={`More for ${detail.data.name}`} className="aria-expanded:bg-surface-hover" />}
                >
                  <EllipsisIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-48 p-1.5">
                  {editable && (
                    <DropdownMenuItem className="gap-2.5 px-3 py-2.5" onClick={() => router.push(editHref)}>
                      <PencilIcon />
                      Edit steps
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    className="gap-2.5 px-3 py-2.5"
                    disabled={remove.isPending || running}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2Icon />
                    Delete job
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {runError && <p className="text-[13px] text-danger">{runError}</p>}

          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] text-muted-foreground">Steps</h3>
            <StepsTimeline steps={tree} />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] text-muted-foreground">Runs</h3>
            {runs.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : !runs.data?.length && !running ? (
              <p className="text-[13px] text-muted-foreground">No runs yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {running && !runs.data?.some((r) => (myRun ? r.runId === myRun : r.status === "running")) && (
                  <RunRow run={null} name={name} />
                )}
                {runs.data?.map((r) => (
                  <RunRow key={r.runId} run={r} name={name} steps={steps} open={openRun === r.runId} onToggle={() => setOpenRun((x) => (x === r.runId ? null : r.runId))} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {detail.data?.name ?? "this job"}?</DialogTitle>
            <DialogDescription>The job and its schedule are removed. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(workflowId, { onSuccess: () => setConfirmDelete(false) })}
            >
              {remove.isPending && <Loader2Icon className="animate-spin motion-reduce:animate-none" />}
              Delete job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/**
 * A job's steps as a timeline (Ancung, 10 Nov): each step's icon in the Builder's colour for its
 * kind and a line joining them. An If shows its Yes and No side by side, each a timeline of its own
 * that may hold more Ifs (#164); an empty way reads "Carries on", then the line goes on below.
 */
function StepsTimeline({ steps, nested = false }: { steps: JobStep[]; nested?: boolean }) {
  return (
    <ol className="flex flex-col">
      {steps.map((x, i) => {
        const Icon = STEP_ICON[x.kind]
        const last = i === steps.length - 1
        return (
          <li key={x.id} className={cn("relative flex flex-col", !last && (nested ? "pb-2.5" : "pb-4"))}>
            {!last && <span aria-hidden className={cn("absolute bottom-0 w-px bg-border-strong", nested ? "top-8 left-3.5" : "top-9 left-4")} />}
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "relative flex shrink-0 items-center justify-center rounded-md",
                  nested ? "size-7 [&>svg]:size-3.5" : "size-8 [&>svg]:size-4",
                  TONE[TONE_OF_NODE[x.kind]]
                )}
              >
                <Icon />
              </span>
              <div className="flex min-w-0 flex-col pt-1">
                <span className="text-sm font-medium text-foreground">{x.title}</span>
                {x.note && <span className="text-xs break-words text-muted-foreground">{x.note}</span>}
                {x.prompt && <PromptPreview parts={x.prompt} className="line-clamp-3 text-xs break-words text-muted-foreground" />}
              </div>
            </div>
            {x.kind === "condition" && (
              <div className={cn("relative mt-2.5 grid gap-2 sm:grid-cols-2", nested ? "pl-10" : "pl-11")}>
                {(["then", "else"] as const).map((h) => (
                  <div key={h} className="flex min-w-0 flex-col gap-2 rounded-md bg-muted/50 p-3">
                    {/* Sentence case, no wide caps (UI rules). */}
                    <span className="text-xs font-medium text-muted-foreground">{h === "then" ? "Yes" : "No"}</span>
                    {x[h]?.length ? <StepsTimeline steps={x[h]!} nested /> : <span className="text-sm text-muted-foreground">Carries on</span>}
                  </div>
                ))}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * One run: a plain one-line summary, and a click opens everything (Ancung, 10 Nov: a long note was
 * cut off with its Markdown showing): what the Mind wrote, rendered as in the chat, and what each
 * step found.
 */
function RunRow({
  run,
  name,
  steps = [],
  open = false,
  onToggle,
}: {
  run: WorkflowRun | null
  name: string
  steps?: JobStep[]
  open?: boolean
  onToggle?: () => void
}) {
  const summary = run ? runSummary(run, name) : null
  const status = !run || run.status === "running" ? "running" : run.status === "success" ? "ok" : run.status === "failed" ? "failed" : "other"
  const when = run ? `${shortWhen(run.startedAt)}, ${clockTime(run.startedAt)}` : "Now"
  const text = run ? runText(run) : null
  const canOpen = Boolean(run && onToggle && run.status !== "running" && run.nodes.length)
  const badge =
    status === "ok" ? (
      <Badge variant="success">
        <CheckIcon />
        Completed
      </Badge>
    ) : status === "failed" ? (
      <Badge variant="destructive">
        <XIcon />
        Failed
      </Badge>
    ) : status === "running" ? (
      <Badge variant="info">
        <Loader2Icon className="animate-spin motion-reduce:animate-none" />
        Running
      </Badge>
    ) : (
      <Badge variant="neutral">{run?.status}</Badge>
    )
  const head = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">
          {when}
          {run?.trigger === "manual" || !run ? <span className="font-normal text-muted-foreground">, started by you</span> : null}
        </span>
        {!open && <span className="line-clamp-2 text-[13px] break-words text-muted-foreground">{summary ?? "Working through the steps..."}</span>}
      </div>
      {badge}
      {canOpen && <ChevronDownIcon aria-hidden className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out", open && "rotate-180")} />}
    </>
  )
  return (
    <li className="py-1">
      {canOpen ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-md px-2 py-2.5 text-left outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
        >
          {head}
        </button>
      ) : (
        <div className="flex items-start gap-3 py-2.5">{head}</div>
      )}
      {open && run && (
        <div className="flex flex-col gap-4 pt-2 pb-3">
          {text && <ReplyText text={text} live={false} />}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">What each step did</span>
            <ol className="flex flex-col gap-1.5">
              {run.nodes.map((n) => {
                const step = steps.find((x) => x.id === n.node || x.id === n.nodeId)
                const Icon = step ? STEP_ICON[step.kind] : null
                const failed = n.status === "error"
                return (
                  <li key={`${n.node}-${n.startedAt ?? ""}`} className="flex items-start gap-2.5 text-[13px]">
                    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-[6px] [&>svg]:size-3.5", step ? TONE[TONE_OF_NODE[step.kind]] : "bg-muted text-muted-foreground")}>
                      {Icon && <Icon />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-foreground">{step?.title ?? n.node}</span>
                      <span className={cn("break-words", failed ? "text-danger" : "text-muted-foreground")}>
                        {failed ? (n.error ?? "It didn't work.").replace(/^\w*Error:\s*/, "") : n.nodeType === "agent" ? "Wrote the note above" : nodeSummary(n.output)}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </li>
  )
}

function NoJobs({ mindId, name, demo, onAdded }: { mindId: string; name: string; demo: boolean; onAdded: (id: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <RepeatIcon className="size-5 text-muted-foreground" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold text-foreground">No jobs yet</p>
        <p className="max-w-md text-sm text-muted-foreground">A job is a few steps {name} runs on a schedule. Start from one of these, or build your own with New job.</p>
      </div>
      <ul className="grid w-full max-w-2xl gap-3 text-left md:grid-cols-2">
        <Ideas mindId={mindId} name={name} demo={demo} taken={[]} onAdded={onAdded} />
      </ul>
    </div>
  )
}

/** The ready jobs not added yet. In the list they sit under the jobs, smaller. */
function Ideas({
  mindId,
  name,
  demo,
  taken,
  onAdded,
  compact,
}: {
  mindId: string
  name: string
  demo: boolean
  taken: string[]
  onAdded: (id: string) => void
  compact?: boolean
}) {
  const left = IDEAS.filter((i) => !taken.includes(i.workflowId))
  if (!left.length) return null
  return (
    <>
      {compact && <li className="pt-3 text-xs text-muted-foreground">Ready to add</li>}
      {left.map((idea) => (
        <IdeaCard key={idea.workflowId} mindId={mindId} name={name} demo={demo} idea={idea} onAdded={onAdded} compact={compact} />
      ))}
    </>
  )
}

function IdeaCard({ mindId, name, demo, idea, onAdded, compact }: { mindId: string; name: string; demo: boolean; idea: Idea; onAdded: (id: string) => void; compact?: boolean }) {
  const mind = useMind(mindId).data
  const wallet = useMindWallet(mindId).data
  const add = useAddJob(mindId)
  const setSkills = useSetSkills(mindId)
  const missingSkill = idea.needsSkill && mind && !mind.skills.includes(idea.needsSkill) ? idea.needsSkill : null
  const noWallet = idea.needsWallet && wallet === null
  const busy = add.isPending || setSkills.isPending

  async function use() {
    if (missingSkill && mind) await setSkills.mutateAsync([...mind.skills, missingSkill])
    const timezone = browserTimeZone() ?? "UTC"
    const workflowId = await add.mutateAsync({ workflowId: idea.workflowId, canvas: idea.canvas({ timezone, address: wallet?.address ?? null }), turnOn: !demo })
    onAdded(workflowId)
  }

  return (
    <li className={cn("flex flex-col gap-2 rounded-md bg-muted p-3", compact && "bg-transparent border border-dashed border-border-strong")}>
      <span className="text-sm font-semibold text-foreground">{idea.title}</span>
      <span className="text-[13px] text-muted-foreground">{idea.line}</span>
      {noWallet ? (
        <span className="text-xs text-muted-foreground">
          Needs a wallet.{" "}
          <Link href={mindHref(mindId, "wallet")} className="font-medium text-foreground underline underline-offset-2">
            Set one up
          </Link>
        </span>
      ) : (
        <>
          {missingSkill && <span className="text-xs text-muted-foreground">Adds the {skillCopy(missingSkill).title} skill to {name}.</span>}
          <Button size="sm" variant="outline" className="w-fit" disabled={busy || wallet === undefined} onClick={() => void use()}>
            {busy && <Loader2Icon className="animate-spin motion-reduce:animate-none" />}
            Use this
          </Button>
          {demo && <span className="text-xs text-muted-foreground">In a try-out it stays off; you can run it with Run now.</span>}
          {(add.error || setSkills.error) && <span className="text-xs text-danger">Could not add it. Please try again later.</span>}
        </>
      )}
    </li>
  )
}
