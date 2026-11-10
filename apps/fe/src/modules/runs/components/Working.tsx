"use client"

import { ThinkingOrb } from "thinking-orbs"
import { Elapsed } from "@/modules/runs/components/ReplySteps"

/**
 * The Mind is at work and nothing else shows it yet (design C1.3): typing dots and "Thinking..."
 * from the moment the message is sent until the first text, thought or step (Ancung, 9 Nov: one
 * word for the whole wait; "Sending" read like money moving in a payments app).
 */
export function Working({ name }: { name: string }) {
  return (
    <span role="status" aria-label={`${name} is thinking`} className="flex h-[22px] items-center gap-2">
      {/* A thinking orb (thinking-orbs, Axel's pick, 10 Nov) instead of three dots. It follows the
          dark class, freezes with reduced motion and pauses off screen by itself. */}
      <ThinkingOrb state="solving" size={20} aria-hidden className="shrink-0" />
      <span aria-hidden className="text-shimmer text-[13px]">
        Thinking...
      </span>
      <Elapsed />
    </span>
  )
}
