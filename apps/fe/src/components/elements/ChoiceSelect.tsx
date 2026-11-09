"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "cn"

export type Choice<T extends string> = { value: T; label: string }

/**
 * A dropdown with the app's look (shadcn Select on Base UI), instead of the browser's own
 * `<select>` (Ancung, 9 Nov: the native list looked out of place). Shows the chosen label, opens
 * below the field, keyboard and screen readers work as Base UI provides.
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
