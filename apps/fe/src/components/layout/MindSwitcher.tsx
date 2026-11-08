"use client"

import { CheckIcon, ChevronDownIcon, ChevronsUpDownIcon, PlusIcon, SettingsIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { cn } from "cn"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { mindHref } from "@/components/layout/nav"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { formatNear } from "@/lib/format"
import { templateLabel, type Mind } from "@/modules/minds/data/minds"
import { useMind, useMinds } from "@/modules/minds/hooks/useMinds"

function mindLine(mind: Mind) {
  const template = templateLabel(mind.templateId)
  if (mind.balanceNear === undefined) return template // wallet couldn't be read
  return mind.balanceNear === null ? `${template} · no wallet yet` : `${template} · ${formatNear(mind.balanceNear)} NEAR`
}

/**
 * Switch Mind (design N1.7 menu on desktop and tablet, N1.2 sheet on phones).
 * Each Mind keeps its own wallet and limits, so switching only changes the URL.
 */
export function MindSwitcher({
  mindId,
  variant,
  segment = "chat",
}: {
  mindId: string
  variant: "card" | "avatar" | "header"
  segment?: string
}) {
  const { data: current } = useMind(mindId)
  const { data: minds = [] } = useMinds()
  const [sheetOpen, setSheetOpen] = useState(false)
  if (!current) return null

  if (variant === "header") {
    // Phone: a bottom sheet with the same content.
    return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger
          className="flex min-w-0 items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors hover:bg-surface-hover"
          aria-label={`Switch Mind, current: ${current.name}`}
        >
          <MindAvatar templateId={current.templateId} size={32} />
          <span className="truncate text-[15px] font-semibold">{current.name}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-tertiary-foreground" />
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-xl pb-6">
          <SheetHeader>
            <SheetTitle>Your Minds</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-2">
            {minds.map((mind) => (
              <Link
                key={mind.mindId}
                href={mindHref(mind.mindId, segment)}
                onClick={() => setSheetOpen(false)}
                className="flex items-center gap-3 rounded-md p-2.5 transition-colors hover:bg-surface-hover"
              >
                <MindAvatar templateId={mind.templateId} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{mind.name}</span>
                  <span className="block truncate text-xs text-tertiary-foreground">{mindLine(mind)}</span>
                </span>
                {mind.mindId === mindId && <CheckIcon className="size-4 shrink-0" />}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            <Link
              href={mindHref(mindId, "settings")}
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-3 rounded-md p-3 text-sm font-medium transition-colors hover:bg-surface-hover"
            >
              <SettingsIcon className="size-[18px] text-muted-foreground" />
              {current.name}&apos;s settings
            </Link>
            <Link
              href="/minds/new"
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-3 rounded-md p-3 text-sm font-medium transition-colors hover:bg-surface-hover"
            >
              <PlusIcon className="size-[18px] text-muted-foreground" />
              Create another Mind
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Switch Mind, current: ${current.name}`}
        className={cn(
          variant === "card" &&
            "flex w-full items-center gap-2.5 rounded-md bg-muted p-2.5 text-left transition-colors hover:bg-[color-mix(in_oklab,var(--muted),var(--foreground)_5%)] aria-expanded:bg-[color-mix(in_oklab,var(--muted),var(--foreground)_5%)]",
          variant === "avatar" && "rounded-full transition-transform active:scale-[0.97]"
        )}
      >
        <MindAvatar templateId={current.templateId} />
        {variant === "card" && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{current.name}</span>
              <span className="block truncate text-xs text-tertiary-foreground">
                {templateLabel(current.templateId)}
              </span>
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 text-tertiary-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "avatar" ? "right" : "bottom"}
        align="start"
        className={cn("p-1.5", variant === "card" ? "w-(--anchor-width)" : "w-64")}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Your Minds</DropdownMenuLabel>
          {minds.map((mind) => (
            <DropdownMenuItem
              key={mind.mindId}
              render={<Link href={mindHref(mind.mindId, segment)} />}
              className="gap-2.5 p-2"
            >
              <MindAvatar templateId={mind.templateId} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{mind.name}</span>
                <span className="block truncate text-xs text-tertiary-foreground">{mindLine(mind)}</span>
              </span>
              {mind.mindId === mindId && <CheckIcon />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={mindHref(mindId, "settings")} />} className="p-2">
          <SettingsIcon />
          {current.name}&apos;s settings
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/minds/new" />} className="p-2">
          <PlusIcon />
          Create another Mind
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
