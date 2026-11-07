import { cn } from "cn"

// The lime count on Approvals (design: Nav count, rail dot, phone top bar badge).
// Hidden at zero so it never says "0 waiting".
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs leading-5 font-semibold text-on-brand",
        className
      )}
      aria-label={`${count} waiting`}
    >
      {count}
    </span>
  )
}
