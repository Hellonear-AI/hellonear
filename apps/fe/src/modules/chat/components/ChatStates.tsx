"use client"

import { type ReactNode, type Ref } from "react"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { introFor } from "@/modules/chat/data/intro"

/**
 * C1.2: a brand new chat. The Mind introduces itself; the composer sits in the gap under it
 * (`slotRef`, ChatScreen lifts it there, like Gemini; Ancung, 11 Nov), and three things to try sit
 * under the composer as chips that wrap on phones.
 */
export function FirstChat({
  name,
  templateId,
  limit,
  disabled,
  onPick,
  slotRef,
  slotHeight,
}: {
  name: string
  templateId: string
  limit: string | null
  disabled: boolean
  onPick: (text: string) => void
  slotRef: Ref<HTMLDivElement>
  slotHeight: number
}) {
  const { intro, suggestions } = introFor(templateId, limit, null)
  return (
    <div className="m-auto flex w-full flex-col items-center gap-3 py-6 text-center">
      <MindAvatar templateId={templateId} size={64} shown={64} className="size-14! md:size-16!" />
      <h2 className="text-2xl font-medium tracking-tight text-foreground md:text-[28px]">Hi, I&apos;m {name}.</h2>
      <p className="max-w-lg text-[15px] text-muted-foreground">{intro}</p>
      {/* Where the composer lands; its height is the composer's own. */}
      <div ref={slotRef} aria-hidden className="mt-3 w-full" style={{ height: slotHeight }} />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <Button key={s} variant="outline" size="sm" disabled={disabled} onClick={() => onPick(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}
    </div>
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
