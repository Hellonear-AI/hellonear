"use client"

import {
  TriangleAlertIcon,
} from "lucide-react"
import { cn } from "cn"
import { Switch } from "@/components/ui/switch"
import { isApiCode } from "@/lib/api"
import { type ApiWorkflow, type AutopilotIssue } from "@/modules/autopilot/api"
import { scheduleText, whenNext } from "@/modules/autopilot/data/schedule"
import { useAutopilotState, useSetAutopilot } from "@/modules/autopilot/hooks/useAutopilot"
import { issueText } from "@/modules/autopilot/data/issues"

export function JobCard({
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
