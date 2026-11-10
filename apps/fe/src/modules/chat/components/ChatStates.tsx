"use client"

import { type ReactNode } from "react"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { introFor } from "@/modules/chat/data/intro"

/** C1.2: a brand new chat. The Mind introduces itself and offers three things to try. */
export function FirstChat({
  name,
  templateId,
  limit,
  disabled,
  onPick,
}: {
  name: string
  templateId: string
  limit: string | null
  disabled: boolean
  onPick: (text: string) => void
}) {
  const { intro, suggestions } = introFor(templateId, limit, null)
  return (
    <Centered>
      <MindAvatar templateId={templateId} size={64} shown={112} className="size-24! md:size-28!" />
      <h2 className="text-2xl font-medium tracking-tight text-foreground md:text-[28px]">Hi, I&apos;m {name}.</h2>
      <p className="max-w-md text-[15px] text-muted-foreground">{intro}</p>
      {suggestions.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          {suggestions.map((s) => (
            <Button key={s} variant="outline" size="sm" disabled={disabled} onClick={() => onPick(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}
    </Centered>
  )
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="m-auto flex flex-col items-center gap-3 py-10 text-center">{children}</div>
}

export function ThreadSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <Skeleton className="ml-auto h-10 w-56 rounded-[18px]" />
      <Skeleton className="h-24 w-full max-w-[480px] rounded-[18px]" />
      <Skeleton className="ml-auto h-10 w-40 rounded-[18px]" />
      <Skeleton className="h-16 w-full max-w-[420px] rounded-[18px]" />
    </div>
  )
}
