import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { cn } from "cn"
import { Logo, LogoIcon } from "@/components/elements/Logo"

/** A way out of setting up a Mind (Ancung, 9 Nov: a try-out landed here with no way back). */
export type StepLeave = { label: string; onClick?: () => void; href?: string }

// Top row of the Mind set-up steps (L2, L3): the logo or a way back, "Step n of 2", and a way out.
// A try-out has no limits step, so it shows only the way out.
export function StepHeader({ step, onBack, leave, tryOut }: { step: 1 | 2; onBack?: () => void; leave?: StepLeave; tryOut?: boolean }) {
  return (
    <header className="flex min-h-7 items-center justify-between gap-3">
      {step === 1 ? (
        <Link href="/" className="flex items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <LogoIcon size={28} className="sm:hidden" />
          <Logo height={24} className="hidden sm:block" />
        </Link>
      ) : onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="-mx-1 flex items-center gap-1.5 rounded-sm px-1 py-1 text-[13px] text-muted-foreground outline-none transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ArrowLeftIcon className="size-4" />
          Choose a Mind
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
        {leave &&
          (leave.href ? (
            <Link href={leave.href} className="rounded-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus">
              {leave.label}
            </Link>
          ) : (
            <button type="button" onClick={leave.onClick} className="rounded-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus">
              {leave.label}
            </button>
          ))}
        {!tryOut && (
          <span className="flex items-center gap-2.5">
            <span>Step {step} of 2</span>
            <span className="flex gap-1" aria-hidden="true">
              <span className="h-1 w-6 rounded-full bg-primary" />
              <span className={cn("h-1 w-6 rounded-full", step === 2 ? "bg-primary" : "bg-border-strong")} />
            </span>
          </span>
        )}
      </div>
    </header>
  )
}
