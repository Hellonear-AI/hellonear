"use client"

import { ChevronDownIcon } from "lucide-react"
import { cn } from "cn"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCoarsePointer } from "@/hooks/useCoarsePointer"

export type Choice<T extends string> = { value: T; label: string }

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

  if (touch) {
    return (
      <div className={cn("relative w-full", className)}>
        <select
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="h-11 w-full appearance-none rounded-md border border-input bg-surface pr-10 pl-3.5 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {value === "" && (
            <option value="" disabled>
              {placeholder ?? "Pick one"}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    )
  }

  return (
    <Select
      items={options}
      value={value === "" ? null : value}
      onValueChange={(v) => {
        if (v !== null) onChange(v as T)
      }}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
