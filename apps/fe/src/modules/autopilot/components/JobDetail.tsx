"use client"

import {
  EllipsisIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { Spinner } from "@/components/elements/Spinner"
import { mindHref } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { isApiCode } from "@/lib/api"
import { autopilotApi } from "@/modules/autopilot/api"
import { scheduleText, zoneName } from "@/modules/autopilot/data/schedule"
import { flatSteps, jobTree } from "@/modules/autopilot/data/steps"
import { fromCanvas } from "@/modules/builder/data/draft"
import { useRemoveJob, useWorkflow, useWorkflowRuns } from "@/modules/autopilot/hooks/useAutopilot"
import { useMindWallet } from "@/modules/minds/hooks/useMinds"
import { StepsTimeline } from "@/modules/autopilot/components/StepsTimeline"
import { RunRow } from "@/modules/autopilot/components/RunRow"

export function JobDetail({ mindId, name, workflowId }: { mindId: string; name: string; workflowId: string }) {
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
  // The steps the latest run reached (newest first), so the timeline can show the way it went.
  const lastRun = runs.data?.[0]
  const ran = useMemo(() => new Set(lastRun?.nodes.map((n) => n.nodeId) ?? []), [lastRun])
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
                {running ? <Spinner /> : <PlayIcon />}
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
            <StepsTimeline steps={tree} ran={ran} />
            {ran.size > 0 && <p className="text-xs text-muted-foreground">The green line is the way the last run went.</p>}
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
              {remove.isPending && <Spinner />}
              Delete job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
