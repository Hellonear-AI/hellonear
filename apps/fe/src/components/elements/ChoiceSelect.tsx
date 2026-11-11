"use client"

import { ChevronDownIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "cn"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCoarsePointer } from "@/hooks/useCoarsePointer"

/**
 * `hint` is a second, quieter line in the list (where a value comes from); the field shows "label, hint".
 * `icon` (16 px) sits before the label in the list and in the field (Ancung, 11 Nov: the Builder's
 * tools read as a wall of words).
 */
export type Choice<T extends string> = { value: T; label: string; hint?: string; icon?: ReactNode }

/** An option's icon in a fixed 16 px box, so labels line up with or without one. */
function ChoiceIcon({ icon }: { icon: ReactNode }) {
  return <span aria-hidden className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">{icon}</span>
}

/**
 * A dropdown with the app's look (shadcn Select on Base UI) instead of the browser's own list
 * (Ancung, 9 Nov: the native list looked out of place on desktop). On touch screens it is the
 * device's own picker inside a field that looks the same (10 Nov, design B1.6), since the iOS and
 * Android pickers suit a finger better.
 */
export function ChoiceSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  value: T | ""
  onChange: (value: T) => void
  options: Choice<T>[]
  placeholder?: string
  className?: string
  "aria-label"?: string
}) {
  const touch = useCoarsePointer()
  const picked = options.find((o) => o.value === value)

  if (touch) {
    return (
      <div className={cn("relative w-full", className)}>
        {/* The device's own list can't show icons; the field shows the picked one's. */}
        {picked?.icon && (
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
            <ChoiceIcon icon={picked.icon} />
          </span>
        )}
        <select
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className={cn(picked?.icon ? "pl-10" : "pl-3.5", "h-11 w-full appearance-none rounded-md border border-input bg-surface pr-10 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background")}
        >
          {value === "" && (
            <option value="" disabled>
              {placeholder ?? "Pick one"}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.hint ? `${o.label}, ${o.hint}` : o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    )
  }

  return (
    <Select
      items={options.map((o) => ({ value: o.value, label: o.hint ? `${o.label}, ${o.hint}` : o.label }))}
      value={value === "" ? null : value}
      onValueChange={(v) => {
        if (v !== null) onChange(v as T)
      }}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder}>
          {picked?.icon
            ? () => (
                <span className="flex min-w-0 items-center gap-2.5">
                  <ChoiceIcon icon={picked.icon} />
                  <span className="truncate">{picked.hint ? `${picked.label}, ${picked.hint}` : picked.label}</span>
                </span>
              )
            : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className="flex min-w-0 items-start gap-2.5">
              {o.icon && (
                <span className="mt-0.5">
                  <ChoiceIcon icon={o.icon} />
                </span>
              )}
              {o.hint ? (
                <span className="flex min-w-0 flex-col">
                  <span>{o.label}</span>
                  <span className="text-xs text-muted-foreground">{o.hint}</span>
                </span>
              ) : (
                <span className="min-w-0">{o.label}</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
