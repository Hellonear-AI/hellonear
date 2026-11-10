"use client"

import {
  BotIcon,
  CalendarClockIcon,
  GitBranchIcon,
  OctagonXIcon,
  GlobeIcon,
  SearchIcon,
} from "lucide-react"
import { cn } from "cn"
import { type JobStep } from "@/modules/autopilot/data/steps"
import { TONE, TONE_OF_NODE } from "@/modules/builder/data/tone"
import { PromptPreview } from "@/modules/builder/components/PromptText"

export const STEP_ICON: Record<JobStep["kind"], typeof BotIcon> = {
  trigger: CalendarClockIcon,
  tool: SearchIcon,
  http: GlobeIcon,
  condition: GitBranchIcon,
  agent: BotIcon,
  end: OctagonXIcon,
}

/**
 * A job's steps as a timeline (Ancung, 10 Nov): each step's icon in the Builder's colour for its
 * kind and a line joining them. An If shows its Yes and No side by side, each a timeline of its own
 * that may hold more Ifs (#164); an empty way reads "Carries on", then the line goes on below.
 */
export function StepsTimeline({ steps, nested = false }: { steps: JobStep[]; nested?: boolean }) {
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
