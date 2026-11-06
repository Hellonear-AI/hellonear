import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // Input/Default: 44 px tall, 12 px radius, border-strong; 16 px text on phones so iOS does not zoom
        "h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3.5 text-base text-foreground transition-[border-color,box-shadow] duration-150 ease-out outline-none placeholder:text-tertiary-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:shadow-[0_0_0_0.5px_var(--danger)] md:text-[15px] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input }
