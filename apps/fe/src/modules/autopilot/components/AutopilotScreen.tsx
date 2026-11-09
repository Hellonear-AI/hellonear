"use client"

import {
  BotIcon,
  CalendarClockIcon,
  CheckIcon,
  GitBranchIcon,
  GlobeIcon,
  InfoIcon,
  Loader2Icon,
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
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { cn } from "cn"
import { PageTitle } from "@/components/elements/PageTitle"
import { mindHref } from "@/components/layout/nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "@/lib/api"
import { shortWhen, clockTime } from "@/lib/format"
import { TryOutLockedDialog, useTryOutLock } from "@/modules/auth/components/TryOutLockedDialog"
import { useSession } from "@/modules/auth/hooks/useSession"
import { autopilotApi, type ApiWorkflow, type AutopilotIssue, type WorkflowRun } from "@/modules/autopilot/api"
import { IDEAS, type Idea } from "@/modules/autopilot/data/ideas"
import { runSummary } from "@/modules/autopilot/data/runs"
import { scheduleText, whenNext, zoneName } from "@/modules/autopilot/data/schedule"
import { jobSteps, type JobStep } from "@/modules/autopilot/data/steps"
import { fromCanvas } from "@/modules/builder/data/draft"
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
          <p className="text-sm text-muted-foreground">Couldn&apos;t load {name}&apos;s jobs. Try again in a moment.</p>
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
  const refused = set.error instanceof ApiError && set.error.code === "cannot_autopilot" ? ((set.error.details.issues as AutopilotIssue[]) ?? []) : []
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
        {set.error && !refused.length && <p className="text-xs text-danger">Couldn&apos;t change it. Try again in a moment.</p>}
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
          err instanceof ApiError && err.code === "missing_tools"
            ? `${name} doesn't have a skill this job uses. Add it in Skills first.`
            : err instanceof ApiError && err.code === "demo_run_limit"
              ? "That's all the messages this try-out has."
              : "The job didn't start. Try again in a moment."
        )
      }
    }
    if (controller.signal.aborted) return
    setRunning(false)
    void runs.refetch()
  }

  const canvas = detail.data?.canvas
  const steps = canvas ? jobSteps(canvas, name) : []
  const trigger = canvas?.nodes.find((n) => n.type === "trigger")
  const schedule = trigger?.type === "trigger" ? trigger.data.schedule : undefined

  return (
    <section aria-labelledby="job" className="flex min-w-0 flex-1 flex-col gap-5 rounded-lg border border-border bg-surface p-5">
      {detail.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : !detail.data ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load this job.</p>
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
            <div className="flex shrink-0 gap-2">
              {fromCanvas(detail.data.canvas, "UTC") && (
                <Button variant="outline" nativeButton={false} render={<Link href={`${mindHref(mindId, "autopilot")}/${encodeURIComponent(workflowId)}`} />}>
                  <PencilIcon />
                  Edit steps
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${detail.data.name}`}
                title="Delete job"
                disabled={remove.isPending || running}
                onClick={() => remove.mutate(workflowId)}
              >
                <Trash2Icon />
              </Button>
              <Button onClick={() => void runNow()} disabled={running}>
                {running ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <PlayIcon />}
                {running ? "Running" : "Run now"}
              </Button>
            </div>
          </div>
          {runError && <p className="text-[13px] text-danger">{runError}</p>}

          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] text-muted-foreground">Steps</h3>
            <ol className="flex flex-col gap-2.5">
              {steps.map((s) => {
                const Icon = STEP_ICON[s.kind]
                return (
                  <li key={s.id} className={cn("flex items-start gap-3", s.branch && "pl-6")}>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm text-foreground">
                        {s.branch === "then" ? "If yes: " : s.branch === "else" ? "If no: " : ""}
                        {s.title}
                      </span>
                      {s.note && <span className="text-xs text-muted-foreground">{s.note}</span>}
                    </div>
                  </li>
                )
              })}
              {steps.some((s) => s.kind === "condition") && !steps.some((s) => s.branch === "else") && (
                <li className="flex items-center gap-3 pl-6 text-xs text-muted-foreground">If no: it stops there.</li>
              )}
            </ol>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] text-muted-foreground">Runs</h3>
            {runs.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : !runs.data?.length && !running ? (
              <p className="text-[13px] text-muted-foreground">No runs yet. Press Run now to try it.</p>
            ) : (
              <ul className="flex flex-col">
                {running && !runs.data?.some((r) => (myRun ? r.runId === myRun : r.status === "running")) && (
                  <RunRow run={null} name={name} />
                )}
                {runs.data?.map((r) => (
                  <RunRow key={r.runId} run={r} name={name} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function RunRow({ run, name }: { run: WorkflowRun | null; name: string }) {
  const summary = run ? runSummary(run, name) : null
  const status = !run || run.status === "running" ? "running" : run.status === "success" ? "ok" : run.status === "failed" ? "failed" : "other"
  const when = run ? `${shortWhen(run.startedAt)}, ${clockTime(run.startedAt)}` : "Now"
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">
          {when}
          {run?.trigger === "manual" || !run ? <span className="font-normal text-muted-foreground">, started by you</span> : null}
        </span>
        <span className="text-[13px] break-words text-muted-foreground">{summary ?? "Working through the steps..."}</span>
      </div>
      {status === "ok" ? (
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
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
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
          {(add.error || setSkills.error) && <span className="text-xs text-danger">Couldn&apos;t add it. Try again in a moment.</span>}
        </>
      )}
    </li>
  )
}
