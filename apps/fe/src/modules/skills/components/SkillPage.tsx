"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeftIcon, ArrowUpRightIcon, CheckIcon, PlugIcon } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { mindHref } from "@/components/layout/nav"
import { useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"
import { skillCopy, skillLines, type SkillLine } from "@/modules/skills/data/skills"
import { SkillLines } from "@/modules/skills/components/SkillLines"
import { useConnections } from "@/modules/connections/hooks/useConnections"
import { useSession } from "@/modules/auth/hooks/useSession"
import { RemoveSkillDialog } from "@/modules/skills/components/SkillDialogs"
import { SKILL_ICON } from "@/modules/skills/data/icons"
import { SkillInstructions } from "@/modules/skills/components/SkillInstructions"

/**
 * One skill's settings (S3.1): what it does and the rules it follows, then Remove at the bottom.
 * Payments has no limits of its own: they are the Mind's wallet limits, changed in Wallet (#55).
 */
export function SkillPage({ mindId, skillId }: { mindId: string; skillId: string }) {
  const router = useRouter()
  const mind = useMind(mindId).data
  const wallet = useMindWallet(mindId).data
  const [removing, setRemoving] = useState(false)
  const [opened, setOpened] = useState(0)

  const name = mind?.name ?? "Your Mind"
  const connections = useConnections().data
  const session = useSession()
  const ctx = {
    name,
    limit: wallet?.policy?.perTransactionNear ?? null,
    apps: Object.fromEntries((connections ?? []).map((c) => [c.toolkit, c.status])),
    tryOut: Boolean(session.data?.demo),
  }
  const copy = skillCopy(skillId)
  const Icon = SKILL_ICON[skillId] ?? PlugIcon
  const added = Boolean(mind?.skills.includes(skillId))
  // Back to the tab and page the owner came from (`?back=tab=apps&page=2`).
  const back = useSearchParams().get("back")
  const skillsHref = `${mindHref(mindId, "skills")}${back && /^[\w=&-]+$/.test(back) ? `?${back}` : ""}`
  const rules: SkillLine[] =
    skillId === "payments"
      ? [
          { t: "Asks you before every payment", tone: "ok" },
          { t: ctx.limit ? `Up to ${ctx.limit} NEAR each, from ${name}'s wallet` : "Only inside the limits you set in Wallet", tone: "ok" },
          { t: "Only to the addresses on your list", tone: "ok" },
        ]
      : skillLines(skillId, ctx)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6 xl:p-8">
      <Link href={skillsHref} className="flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus">
        <ArrowLeftIcon className="size-4" />
        Skills
      </Link>

      <div className="flex items-start gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-6 text-foreground" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-[26px] font-medium tracking-[-0.8px] text-foreground md:text-[32px]">{copy.title}</h1>
          <p className="text-sm text-muted-foreground md:text-[15px]">{copy.blurb}</p>
          {/* Phones: under the text, so the blurb gets the width (beside the title it squeezed the
              blurb into a 190 px column; the phone check, 11 Nov). */}
          {mind && <AddedBadge added={added} className="mt-1 w-fit md:hidden" />}
        </div>
        {mind && <AddedBadge added={added} className="max-md:hidden" />}
      </div>

      {rules.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="text-[15px] font-semibold text-foreground">{skillId === "payments" ? "How it pays" : "What it can use"}</h2>
          <SkillLines mindId={mindId} lines={rules} size="md" />
          {copy.needsWallet && (
            <Link href={mindHref(mindId, "wallet")} className="flex w-fit items-center gap-1 rounded-sm text-[13px] font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus">
              Change these limits in Wallet
              <ArrowUpRightIcon className="size-3.5" />
            </Link>
          )}
        </section>
      )}

      <SkillInstructions skillId={skillId} name={name} />

      {added ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[15px] font-semibold text-foreground">Remove {copy.title}</h2>
            <p className="text-[13px] text-muted-foreground">{copy.removed(ctx)}</p>
          </div>
          <Button
            variant="outline"
            className="w-fit border-danger text-danger hover:bg-danger-soft"
            onClick={() => {
              setOpened((n) => n + 1)
              setRemoving(true)
            }}
          >
            Remove skill
          </Button>
        </section>
      ) : (
        mind && (
          <Button variant="outline" className="w-fit" nativeButton={false} render={<Link href={skillsHref} />}>
            Add it from Skills
          </Button>
        )
      )}

      {mind && (
        <RemoveSkillDialog
          key={opened}
          mindId={mindId}
          skillId={skillId}
          skills={mind.skills}
          ctx={ctx}
          open={removing}
          onOpenChange={setRemoving}
          onRemoved={() => router.push(skillsHref)}
        />
      )}
    </div>
  )
}

function AddedBadge({ added, className }: { added: boolean; className?: string }) {
  return (
    <Badge variant={added ? "success" : "neutral"} className={className}>
      {added && <CheckIcon />}
      {added ? "Added" : "Not added"}
    </Badge>
  )
}
