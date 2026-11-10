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
 * kind and a line joining them. An If's Yes and No sit one under the other, each a timeline of its
 * own that may hold more Ifs (#164), hanging off a line from the If's icon (Ancung, 11 Nov: side
 * by side, Ifs inside Ifs halved the width each time until words broke letter by letter). Each
 * level only steps in by about an icon's width, so a deep tree still fits a phone. An empty way
 * reads "Carries on".
 */
export function StepsTimeline({ steps, nested = false }: { steps: JobStep[]; nested?: boolean }) {
  return (
    <ol className="flex min-w-0 flex-col">
      {steps.map((x, i) => {
        const Icon = STEP_ICON[x.kind]
        const last = i === steps.length - 1
        const branch = x.kind === "condition"
        return (
          <li key={x.id} className={cn("relative flex min-w-0 flex-col", !last && (nested ? "pb-3" : "pb-4"))}>
            {/* The line to the next step; under an If its ways' own lines carry it down. */}
            {!last && !branch && <span aria-hidden className={cn("absolute bottom-0 w-px bg-border-strong", nested ? "top-8 left-3.5" : "top-9 left-4")} />}
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={cn(
                  "relative flex shrink-0 items-center justify-center rounded-md",
                  nested ? "size-7 [&>svg]:size-3.5" : "size-8 [&>svg]:size-4",
                  TONE[TONE_OF_NODE[x.kind]]
                )}
              >
                <Icon />
              </span>
              <div className={cn("flex min-w-0 flex-1 flex-col", nested ? "pt-0.5" : "pt-1")}>
                <span className="text-sm font-medium break-words text-foreground">{x.title}</span>
                {x.note && <span className="text-xs break-words text-muted-foreground">{x.note}</span>}
                {x.prompt && <PromptPreview parts={x.prompt} className="line-clamp-3 text-xs break-words text-muted-foreground" />}
              </div>
            </div>
            {branch && (
              // A tree (Ancung, 11 Nov): a line down from the If's icon with a short branch across to
              // each way, "├ Yes" and "└ No"; the line stops at the last way.
              <div className={cn("flex min-w-0 flex-col", nested ? "ml-3.5" : "ml-4")}>
                {(["then", "else"] as const).map((h, k) => (
                  <div key={h} className="relative flex min-w-0 flex-col gap-2 pt-2 pl-5">
                    <span aria-hidden className={cn("absolute left-0 w-px bg-border-strong", k === 0 ? "inset-y-0" : "top-0 h-4")} />
                    <span aria-hidden className={cn("absolute top-4 left-0 h-px w-3.5", h === "then" ? "bg-success" : "bg-border-strong")} />
                    {/* Sentence case, no wide caps (UI rules). */}
                    <span className={cn("text-xs leading-4 font-medium", h === "then" ? "text-success" : "text-muted-foreground")}>{h === "then" ? "Yes" : "No"}</span>
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
