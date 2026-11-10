"use client"

import { CheckIcon, ListChecksIcon, ChevronDownIcon, Loader2Icon, SquareIcon, XIcon } from "lucide-react"
import { useEffect, useId, useState, type ReactNode } from "react"
import { cn } from "cn"
import type { ToolStep } from "@/modules/chat/data/events"
import { duration, stepDuration, stepText } from "@/modules/chat/data/steps"

// The Mind's work inside its reply (Ancung, 9 Nov, instead of a separate live view): one quiet
// row per tool and per stretch of reasoning. Running rows shimmer; finished rows open to show
// what went in and came out. Secrets in events are already "••••" (docs/api-contract.md §3).

/** One tool call: "Checking the balance..." while it runs, then "Checked the balance 4.79 NEAR". */
export function StepRow({ step }: { step: ToolStep }) {
  const { label, detail, tone } = stepText(step)
  const took = tone === "doing" ? null : stepDuration(step)
  const icon =
    tone === "doing" ? (
      <Loader2Icon className="animate-spin motion-reduce:animate-[hn-fade-pulse_1.6s_ease_infinite]" />
    ) : tone === "done" ? (
      <CheckIcon className="text-success" />
    ) : tone === "stopped" ? (
      <SquareIcon className="fill-current text-muted-foreground" />
    ) : (
      <XIcon className="text-danger" />
    )
  const details = tone === "doing" ? null : <StepDetails step={step} />
  return (
    <Row
      icon={icon}
      label={label}
      detail={detail}
      shimmer={tone === "doing"}
      details={details}
      // How long it took, or a live count while it runs (Ancung, 9 Nov: to see where the time went).
      after={tone === "doing" ? <Elapsed /> : took ? <span className="text-xs text-tertiary-foreground tabular-nums">{took}</span> : null}
    />
  )
}

/**
 * Seconds since this mounted, shown from 3 s on so short waits stay quiet. Counted on this
 * device's clock while live (the engine's clock may differ); finished rows use event times.
 */
export function Elapsed() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])
  if (seconds < 3) return null
  return <span className="text-xs text-tertiary-foreground tabular-nums">{duration(seconds * 1000)}</span>
}

/** A stretch of reasoning: "Thinking..." while it streams, then "Thought for 4s" with the text inside. */
export function ThoughtRow({ text, from, to, live }: { text: string; from: string; to: string; live: boolean }) {
  const seconds = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000))
  return (
    <Row
      icon={null}
      label={live ? "Thinking..." : `Thought for ${seconds}s`}
      detail={null}
      shimmer={live}
      details={text.trim() ? <p className="text-[13px] leading-5 whitespace-pre-wrap text-muted-foreground">{text.trim()}</p> : null}
    />
  )
}

/**
 * A finished reply's steps and thoughts folded into one line that opens to show them all, in
 * order, each still openable (Ancung, 9 Nov). While the Mind works they show one by one instead.
 */
export function StepsSummary({ label, children }: { label: string; children: ReactNode }) {
  return <Row icon={<ListChecksIcon className="text-muted-foreground" />} label={label} detail={null} shimmer={false} details={<div className="flex flex-col">{children}</div>} />
}

function Row({
  icon,
  label,
  detail,
  shimmer,
  details,
  after,
}: {
  /** Status icon for tools; thoughts have none (Ancung, 9 Nov). */
  icon: ReactNode
  label: string
  detail: string | null
  shimmer: boolean
  details: ReactNode
  /** Something small after the line, like how long the step took. */
  after?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const line = (
    <>
      {icon && <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-3.5">{icon}</span>}
      <span className={cn("min-w-0 truncate text-[13px] text-foreground", shimmer && "text-shimmer")}>{label}</span>
      {detail && <span className="min-w-0 truncate text-[13px] text-muted-foreground">{detail}</span>}
      {after && <span className="ml-1 shrink-0">{after}</span>}
    </>
  )

  return (
    <div className="flex w-full flex-col animate-in fade-in-0 duration-150 ease-out motion-reduce:animate-none">
      {details ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="-mx-2 flex w-fit max-w-full items-center gap-2 rounded-sm px-2 py-1 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
        >
          {line}
          <ChevronDownIcon
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none", open && "rotate-180")}
          />
        </button>
      ) : (
        <div className="flex max-w-full items-center gap-2 py-1">{line}</div>
      )}
      {details && open && (
        // Plain and level with the row: no indent, no box (Ancung, 9 Nov).
        <div id={panelId} className="max-w-full pt-1 pb-1 animate-in fade-in-0 duration-150 ease-out motion-reduce:animate-none">
          {details}
        </div>
      )}
    </div>
  )
}

/** What went into the tool and what came back, as plain "name: value" lines (no code font, UI rules). */
function StepDetails({ step }: { step: ToolStep }) {
  const blocks: [string, unknown][] = [
    ["Asked with", step.args],
    // The engine passes JS error text ("Error: ..."); the heading already says Error.
    [step.error ? "Error" : "Got back", step.error ? step.error.replace(/^\w*Error:\s*/, "") : step.result],
  ]
  const shown = blocks.filter(([, v]) => v !== undefined && v !== null && !(typeof v === "object" && Object.keys(v as object).length === 0))
  return (
    <div className="flex flex-col gap-2.5">
      {shown.map(([title, value]) => (
        <div key={title} className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <dl className="flex min-w-0 flex-col gap-0.5 text-[13px] leading-5 text-foreground">
            {lines(value).map(([k, v], i) => (
              <div key={i} className="flex min-w-0 gap-1.5">
                {k && <dt className="shrink-0 text-muted-foreground">{k}:</dt>}
                <dd className="min-w-0 break-words whitespace-pre-wrap">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

/** Flatten a value into readable lines; long values are cut so a big email body doesn't take over. */
export function lines(value: unknown): [string | null, string][] {
  const cut = (v: string) => (v.length > 280 ? `${v.slice(0, 280)}...` : v)
  const show = (v: unknown): string =>
    v === null || v === undefined
      ? "none"
      : typeof v === "object"
        ? Array.isArray(v)
          ? // A short list of plain values (a meeting's guests) reads better than "1 item".
            v.length > 0 && v.length <= 5 && v.every((x) => typeof x === "string" || typeof x === "number")
            ? cut(v.join(", "))
            : `${v.length} ${v.length === 1 ? "item" : "items"}`
          : `${Object.keys(v).length} fields`
        : cut(String(v))
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [[null, show(value)]]
  return Object.entries(value as Record<string, unknown>).map(([k, v]) => [label(k), show(v)])
}

/** "balanceNear" -> "Balance NEAR", "to_account" -> "To account". */
function label(key: string): string {
  const words = key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\bnear\b/g, "NEAR")
  return words.charAt(0).toUpperCase() + words.slice(1)
}
