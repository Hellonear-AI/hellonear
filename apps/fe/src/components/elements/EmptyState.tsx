import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * An empty or not-set-up-yet card: an icon in a circle, a title, a line saying what will show up
 * or what to do, and anything else under it (a button, a list of ideas).
 */
export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center", className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:size-5">{icon}</span>
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {children}
    </div>
  )
}
