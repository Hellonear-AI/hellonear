import type { ReactNode } from "react"

/** A settings field: its label above, the control, and an optional line under it. */
export function Field({
  label,
  as: Tag = "div",
  labelId,
  hint,
  children,
}: {
  label: ReactNode
  /** "label" when the control is a plain input the label should focus. */
  as?: "div" | "label"
  /** For a control that names itself by the label (aria-labelledby). */
  labelId?: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <Tag className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[13px] font-medium text-foreground">
        {label}
      </span>
      {children}
      {hint !== undefined && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Tag>
  )
}
