import type { ReactNode } from "react"
import { cn } from "cn"
import { TONE, type Tone } from "@/modules/builder/data/tone"

/** A settings panel's title with the block's icon tile in its colour. */
export function PanelHead({ icon, title, tone = "start" }: { icon: ReactNode; title: string; tone?: Tone }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("flex size-8 items-center justify-center rounded-sm [&>svg]:size-4", TONE[tone])}>{icon}</span>
      <h2 className="pr-8 text-[15px] font-semibold text-foreground">{title}</h2>
    </div>
  )
}
