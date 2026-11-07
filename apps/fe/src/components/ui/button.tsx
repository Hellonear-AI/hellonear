import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Matches the design's Button/* components (design/hellonear.pen) and Motion v0.3:
// pill shape, press scales to 0.97, hover only on real pointers (Tailwind 4's hover:),
// keyboard focus ring in `focus`, 2 px outside.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent font-medium whitespace-nowrap select-none outline-none transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] active:duration-100 motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Button/Primary
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        // Button/Secondary ("outline" kept because shadcn components use it)
        secondary:
          "border-border-strong bg-surface text-foreground hover:bg-surface-hover aria-expanded:bg-surface-hover",
        outline:
          "border-border-strong bg-surface text-foreground hover:bg-surface-hover aria-expanded:bg-surface-hover",
        // Button/Accent: the lime, used sparingly
        brand: "bg-brand text-on-brand hover:bg-brand-hover",
        // Button/Danger: deeper red in dark mode so white text keeps about 5:1
        destructive: "bg-danger-fill text-on-danger hover:bg-danger-hover",
        // Button/Ghost
        ghost: "bg-transparent text-foreground hover:bg-surface-hover aria-expanded:bg-surface-hover",
        link: "rounded-none text-foreground underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        // Button/*: 12 x 20 padding, 14 px text
        default: "h-11 gap-2 px-5 text-sm",
        // Button/Small/*: 8 x 14 padding, 13 px text
        sm: "h-9 gap-1.5 px-3.5 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-7 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        lg: "h-12 gap-2 px-6 text-[15px]",
        // Button/Icon/*: 40 px circle, 18 px icon
        icon: "size-10 [&_svg:not([class*='size-'])]:size-[18px]",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-11 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    compoundVariants: [
      // Button/Icon/Ghost uses the secondary text color
      { variant: "ghost", size: ["icon", "icon-xs", "icon-sm", "icon-lg"], className: "text-muted-foreground hover:text-foreground" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
