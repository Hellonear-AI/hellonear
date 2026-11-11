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

const EMPTY: ReadonlySet<string> = new Set()

/**
 * Whether the latest run went through a step. Ifs and End send no events (§3), so an If counts
 * when either way ran, and End when the step before it ran.
 */
export function wentThrough(steps: JobStep[], i: number, ran: ReadonlySet<string>): boolean {
  const s = steps[i]
  if (ran.has(s.id)) return true
  if (s.kind === "condition") return wayRan(s.then, ran) || wayRan(s.else, ran)
  if (s.kind === "end" || s.kind === "trigger") return i === 0 ? ran.size > 0 : wentThrough(steps, i - 1, ran)
  return false
}
export const wayRan = (way: JobStep[] | undefined, ran: ReadonlySet<string>) => Boolean(way?.some((_, i) => wentThrough(way, i, ran)))

/**
 * A job's steps as a timeline (Ancung, 10 Nov): each step's icon in the Builder's colour for its
 * kind and a line joining them. An If's ways branch off one line like a tree, "Yes" then "No",
 * each a timeline of its own that may hold more Ifs (#164), so Ifs inside Ifs only step in by
 * about 36 px and still fit a phone (Ancung, 11 Nov: side by side halved the width each level).
 * The path the latest run took (`ran`, its node ids) is green all the way, with rounded corners
 * where it turns into a way (Ancung, 11 Nov). An empty way reads "Carries on".
 */
export function StepsTimeline({ steps, ran = EMPTY, nested = false }: { steps: JobStep[]; ran?: ReadonlySet<string>; nested?: boolean }) {
  return (
    <ol className="flex min-w-0 flex-col">
      {steps.map((x, i) => {
        const Icon = STEP_ICON[x.kind]
        const last = i === steps.length - 1
        const branch = x.kind === "condition"
        // The line down to the next step is on the path when the run reached that step.
        const onPath = !last && wentThrough(steps, i + 1, ran)
        const ways = branch ? { then: wayRan(x.then, ran), else: wayRan(x.else, ran) } : null
        return (
          <li key={x.id} className={cn("relative flex min-w-0 flex-col", !last && (nested ? "pb-3" : "pb-4"))}>
            {/* The line to the next step; under an If its ways' own lines carry it down. */}
            {!last && !branch && (
              <span
                aria-hidden
                className={cn("absolute bottom-0 -ml-px w-0.5", nested ? "top-8 left-3.5" : "top-9 left-4", onPath ? "bg-success" : "bg-border-strong")}
              />
            )}
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
            {ways && (
              // A tree: one line down from the If's icon, a rounded turn into each way ("├ Yes",
              // "└ No"), the line stopping at the last way. The way the run took draws on top.
              <div className={cn("flex min-w-0 flex-col", nested ? "ml-3.5" : "ml-4")}>
                {(["then", "else"] as const).map((h, k) => {
                  const took = ways[h]
                  const tone = (on: boolean) => (on ? "border-success" : "border-border-strong")
                  return (
                    <div key={h} className="relative flex min-w-0 flex-col gap-2 pt-2 pl-5">
                      {/* Past Yes, the line carries on down to No: green when the run went to No. */}
                      {k === 0 && (
                        <span aria-hidden className={cn("absolute inset-y-0 left-0 -ml-px w-0.5", ways.else ? "z-[1] bg-success" : "bg-border-strong")} />
                      )}
                      {/* A curve is smoothed over its pixels while a straight 2 px line snaps to
                          whole ones, so on a scaled screen the turn read thinner than the line into
                          it (Ancung, 11 Nov). Half a pixel more on the turn evens them out. */}
                      <span
                        aria-hidden
                        className={cn("absolute top-0 left-0 -ml-px h-4 w-3.5 rounded-bl-[10px] border-b-[2.5px] border-l-[2.5px]", took && "z-[2]", tone(took))}
                      />
                      {/* Sentence case, no wide caps (UI rules). */}
                      <span className={cn("text-xs leading-4 font-medium", took ? "text-success" : "text-muted-foreground")}>{h === "then" ? "Yes" : "No"}</span>
                      {x[h]?.length ? <StepsTimeline steps={x[h]!} ran={ran} nested /> : <span className="text-sm text-muted-foreground">Carries on</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
