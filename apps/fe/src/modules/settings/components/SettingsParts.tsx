"use client"

import type { ReactNode } from "react"
import { cn } from "cn"

// The pieces every settings tab is built from (Ancung, 11 Nov, like Claude's settings): a group is
// a heading over rows; a row is its label and a short line on the left and its control on the
// right, with anything longer (a field, a list) underneath. No boxed cards, and no lines between
// rows (Ancung, 11 Nov: the dividers read busy); spacing alone separates them.

/** A heading over rows. */
export function SettingsGroup({ title, description, children, className }: { title?: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-1", className)}>
      {(title || description) && (
        <div className="flex flex-col gap-1 pb-2">
          {title && <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>}
          {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

/** Label and line on the left, the control on the right; `below` for a field or a list under it. */
export function SettingsRow({
  label,
  description,
  control,
  below,
  htmlFor,
  tone,
}: {
  label: ReactNode
  description?: ReactNode
  control?: ReactNode
  below?: ReactNode
  /** The control's id, so the label focuses it. */
  htmlFor?: string
  tone?: "danger"
}) {
  const Label = htmlFor ? "label" : "span"
  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Label htmlFor={htmlFor} className={cn("text-sm font-medium", tone === "danger" ? "text-danger" : "text-foreground")}>
            {label}
          </Label>
          {description && <div className="text-[13px] text-muted-foreground">{description}</div>}
        </div>
        {control && <div className="flex shrink-0 items-center">{control}</div>}
      </div>
      {below}
    </div>
  )
}

/** Discard and Save for a tab's changes, kept at the bottom of the view while there are any. */
export function SaveBar({ message, children }: { message: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-4 z-10 mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-md animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-sm text-foreground">{message}</p>
      <div className="flex gap-2">{children}</div>
    </div>
  )
}
