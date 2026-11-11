import type { ReactNode } from "react"

// Page Title/Large (32/15, tablet and desktop) and Page Title/Small (26/14, phone) from the design,
// with the actions beside it free per screen.
export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-[26px] font-medium tracking-[-0.8px] md:text-[32px]">{title}</h1>
        {description && <p className="text-sm text-muted-foreground md:text-[15px]">{description}</p>}
      </div>
      {/* Wraps on narrow phones (320 px: Add funds and Freeze wallet ran 12 px past the edge). */}
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
