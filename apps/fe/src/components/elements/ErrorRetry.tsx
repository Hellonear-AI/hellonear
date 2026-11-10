import type { ReactNode } from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"

/** What could not load, and Try again. `fullPage` centres it on an otherwise empty screen. */
export function ErrorRetry({
  message,
  onRetry,
  fullPage = false,
  small = false,
  className,
}: {
  message: ReactNode
  onRetry: () => void
  fullPage?: boolean
  small?: boolean
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3",
        fullPage ? "min-h-dvh items-center justify-center bg-background p-6 text-center" : "items-start",
        small && "gap-2",
        className
      )}
    >
      <p className={cn("text-muted-foreground", small ? "text-[13px]" : "text-sm")}>{message}</p>
      <Button variant="outline" size={small ? "sm" : "default"} onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
