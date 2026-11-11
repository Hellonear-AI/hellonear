"use client"

import {
  InfoIcon,
  PlusIcon,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { matches, MEDIA, prefersReducedMotion } from "@/lib/media"
import { PageTitle } from "@/components/elements/PageTitle"
import { mindHref } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { TryOutLockedDialog, useTryOutLock } from "@/modules/auth/components/TryOutLockedDialog"
import { useIsTryOut } from "@/modules/auth/hooks/useSession"
import { useWorkflows } from "@/modules/autopilot/hooks/useAutopilot"
import { useMind } from "@/modules/minds/hooks/useMinds"
import { JobCard } from "@/modules/autopilot/components/JobCard"
import { JobDetail } from "@/modules/autopilot/components/JobDetail"
import { NoJobs, Ideas } from "@/modules/autopilot/components/Ideas"

/**
 * Autopilot (design "7 · Automations", P1.1 to P1.6, #21): jobs a Mind runs on a schedule with
 * nobody watching. Jobs come from the two ready ideas (P1.2) until the Builder (#20) exists, so
 * "New job" and "Edit steps" aren't shown yet. A try-out can save and run a job by hand, but
 * turning a schedule on needs an account (`demo_not_allowed`, T1.4).
 */
export function AutopilotScreen({ mindId }: { mindId: string }) {
  const mind = useMind(mindId).data
  const name = mind?.name ?? "Your Mind"
  const demo = useIsTryOut()
  const jobs = useWorkflows(mindId)
  const locked = useTryOutLock()
  // Back from the Builder with ?job=… opens the job just saved.
  const [picked, setPicked] = useState<string | null>(useSearchParams().get("job"))
  // Below 1280 px the detail sits under every job card and idea, so picking a job scrolls to it;
  // before, a tap on a phone seemed to do nothing (Ancung's phone check, 11 Nov).
  const detail = useRef<HTMLDivElement>(null)
  const pick = (id: string) => {
    setPicked(id)
    if (matches(MEDIA.xl)) return
    requestAnimationFrame(() => detail.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }))
  }
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
                onPick={() => pick(j.workflowId)}
                onLocked={() => locked.lock("autopilot")}
                demo={demo}
              />
            ))}
            <Ideas mindId={mindId} name={name} demo={demo} taken={jobs.data.map((j) => j.workflowId)} onAdded={setPicked} compact />
          </ul>
          {selected && (
            <div ref={detail} className="min-w-0 flex-1 scroll-mt-20">
              <JobDetail key={selected} mindId={mindId} name={name} workflowId={selected} />
            </div>
          )}
        </div>
      )}

      <TryOutLockedDialog action={locked.action} name={name} onClose={locked.close} />
    </div>
  )
}
