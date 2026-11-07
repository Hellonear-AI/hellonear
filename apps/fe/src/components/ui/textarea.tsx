import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-md border border-input bg-surface px-3.5 py-3 text-base text-foreground transition-[border-color,box-shadow] duration-150 ease-out outline-none placeholder:text-tertiary-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:shadow-[0_0_0_0.5px_var(--danger)] md:text-[15px]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
