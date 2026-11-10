"use client"

import {
  RepeatIcon,
} from "lucide-react"
import Link from "next/link"
import { cn } from "cn"
import { EmptyState } from "@/components/elements/EmptyState"
import { Spinner } from "@/components/elements/Spinner"
import { mindHref } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { browserTimeZone } from "@/lib/stream"
import { IDEAS, type Idea } from "@/modules/autopilot/data/ideas"
import { useAddJob } from "@/modules/autopilot/hooks/useAutopilot"
import { useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"
import { skillCopy } from "@/modules/skills/data/skills"
import { useSetSkills } from "@/modules/skills/hooks/useSkills"

export function NoJobs({ mindId, name, demo, onAdded }: { mindId: string; name: string; demo: boolean; onAdded: (id: string) => void }) {
  return (
    <EmptyState
      icon={<RepeatIcon />}
      title="No jobs yet"
      description={`A job is a few steps ${name} runs on a schedule. Start from one of these, or build your own with New job.`}
    >
      <ul className="mt-1 grid w-full max-w-2xl gap-3 text-left md:grid-cols-2">
        <Ideas mindId={mindId} name={name} demo={demo} taken={[]} onAdded={onAdded} />
      </ul>
    </EmptyState>
  )
}

/** The ready jobs not added yet. In the list they sit under the jobs, smaller. */
export function Ideas({
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
            {busy && <Spinner />}
            Use this
          </Button>
          {demo && <span className="text-xs text-muted-foreground">In a try-out it stays off; you can run it with Run now.</span>}
          {(add.error || setSkills.error) && <span className="text-xs text-danger">Could not add it. Please try again later.</span>}
        </>
      )}
    </li>
  )
}
