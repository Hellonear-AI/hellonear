"use client"

import { ClockIcon } from "lucide-react"
import { useState } from "react"
import { cn } from "cn"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const two = (n: number) => String(n).padStart(2, "0")
const HOURS = Array.from({ length: 24 }, (_, h) => two(h))
const FIVES = Array.from({ length: 12 }, (_, i) => two(i * 5))

/** Minutes offered: every 5, plus the saved one when it isn't (07:32 stays pickable). */
export function minuteChoices(current: string): string[] {
  return FIVES.includes(current) || !/^\d{2}$/.test(current) ? FIVES : [...FIVES, current].sort()
}

/**
 * A time field with the app's look (Ancung, 10 Nov: the browser's own time list looked out of
 * place). shadcn has no time picker, so it is shadcn's Popover with two scrolling columns, hours
 * 00 to 23 and minutes every 5. Picking a minute closes it; `value` and `onChange` are "HH:MM".
 */
export function TimePicker({ value, onChange, "aria-label": ariaLabel, className }: { value: string; onChange: (value: string) => void; "aria-label"?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [h = "08", m = "00"] = value.split(":")
  const pick = (hour: string, minute: string) => onChange(`${hour}:${minute}`)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-md border border-input bg-surface pr-3 pl-3.5 text-base text-foreground tabular-nums outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background data-popup-open:ring-2 data-popup-open:ring-focus md:text-[15px]",
          className
        )}
      >
        {h}:{m}
        <ClockIcon className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-52 flex-row gap-1 p-1.5">
        <Column label="Hour" items={HOURS} selected={h} onPick={(hour) => pick(hour, m)} />
        <span aria-hidden className="w-px self-stretch bg-border" />
        <Column
          label="Minute"
          items={minuteChoices(m)}
          selected={m}
          onPick={(minute) => {
            pick(h, minute)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function Column({ label, items, selected, onPick }: { label: string; items: string[]; selected: string; onPick: (v: string) => void }) {
  return (
    <div role="listbox" aria-label={label} className="flex max-h-60 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain">
      {items.map((v) => {
        const on = v === selected
        return (
          <button
            key={v}
            type="button"
            role="option"
            aria-selected={on}
            // The picked one scrolls to the middle when the list opens.
            ref={on ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
            onClick={() => onPick(v)}
            className={cn(
              "shrink-0 rounded-sm py-1.5 text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-focus",
              on ? "bg-primary font-semibold text-primary-foreground" : "text-foreground hover:bg-muted"
            )}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}
