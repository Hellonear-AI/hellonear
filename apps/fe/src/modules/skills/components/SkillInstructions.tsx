"use client"

import { useQuery } from "@tanstack/react-query"
import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { cn } from "cn"
import { Skeleton } from "@/components/ui/skeleton"
import { isApiCode } from "@/lib/api"
import { skillKeys } from "@/lib/queryKeys"
import { ReplyText } from "@/modules/runs/components/ReplyText"
import { skillsApi } from "@/modules/skills/api"

/**
 * "What {name} is told" (#220): the SKILL.md body the Mind reads, folded under the people-friendly
 * words. The rules in it are shown on purpose: the wall is the wallet policy enforced in a TEE, not
 * a secret prompt. Read when first opened; a skill the engine doesn't offer (404) shows nothing.
 */
export function SkillInstructions({ skillId, name }: { skillId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const detail = useQuery({
    queryKey: skillKeys.detail(skillId),
    queryFn: () => skillsApi.skill(skillId),
    enabled: open,
    staleTime: 60_000,
    retry: (count, err) => !isApiCode(err, "unknown_skill") && count < 2,
  })
  if (detail.error && isApiCode(detail.error, "unknown_skill")) return null

  return (
    <section className="flex flex-col rounded-lg border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-start justify-between gap-3 rounded-lg p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="flex flex-col gap-1">
          <span className="text-[15px] font-semibold text-foreground">What {name} is told</span>
          <span className="text-[13px] text-muted-foreground">
            This is the exact text {name} reads when it uses this skill. Your wallet limits are enforced outside it, in a TEE.
          </span>
        </span>
        <ChevronDownIcon className={cn("mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-5 pb-5">
          {detail.isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : detail.error ? (
            <p className="text-[13px] text-danger">Could not load the instructions. Please try again later.</p>
          ) : (
            <ReplyText text={detail.data.markdown} live={false} />
          )}
        </div>
      )}
    </section>
  )
}
