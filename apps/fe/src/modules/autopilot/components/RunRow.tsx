"use client"

import {
  CheckIcon,
  ChevronDownIcon,
  XIcon,
} from "lucide-react"
import { cn } from "cn"
import { Spinner } from "@/components/elements/Spinner"
import { Badge } from "@/components/ui/badge"
import { shortWhen, clockTime } from "@/lib/format"
import { type WorkflowRun } from "@/modules/autopilot/api"
import { runSummary, runText } from "@/modules/autopilot/data/runs"
import { nodeSummary } from "@/modules/builder/data/testRun"
import { ReplyText } from "@/modules/runs/components/ReplyText"
import { type JobStep } from "@/modules/autopilot/data/steps"
import { TONE, TONE_OF_NODE } from "@/modules/builder/data/tone"
import { STEP_ICON } from "@/modules/autopilot/components/StepsTimeline"

/**
 * One run: a plain one-line summary, and a click opens everything (Ancung, 10 Nov: a long note was
 * cut off with its Markdown showing): what the Mind wrote, rendered as in the chat, and what each
 * step found.
 */
export function RunRow({
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
        <Spinner />
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
