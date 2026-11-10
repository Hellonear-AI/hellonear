"use client"

import { SquarePenIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { ThinkingOrb } from "thinking-orbs"
import { cn } from "cn"
import { CountBadge } from "@/components/elements/CountBadge"
import { mindHref, NAV_ITEMS } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useApprovalsCount, useRecentChats } from "@/modules/minds/hooks/useMinds"
import { useActiveRun } from "@/modules/chat/hooks/ChatRunProvider"

export function useActiveSegment(mindId: string) {
  const pathname = usePathname()
  const prefix = `/minds/${mindId}/`
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length).split("/")[0] : ""
}

/** Nav/Default, Nav/Active and Nav/With count from the design: 40 px rows, 18 px icons. */
export function NavList({ mindId, onNavigate }: { mindId: string; onNavigate?: () => void }) {
  const active = useActiveSegment(mindId)
  const { data: approvals = 0 } = useApprovalsCount(mindId)

  return (
    <nav aria-label="Places" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ segment, label, icon: Icon, count }) => {
        const isActive = active === segment
        return (
          <Link
            key={segment}
            href={mindHref(mindId, segment)}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            )}
          >
            <Icon className="size-[18px] shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {count === "approvals" && <CountBadge count={approvals} />}
          </Link>
        )
      })}
    </nav>
  )
}

/** Icon-only nav for the rail (72 px): 44 px buttons with a tooltip, approvals keep their count. */
export function RailNav({ mindId }: { mindId: string }) {
  const active = useActiveSegment(mindId)
  const { data: approvals = 0 } = useApprovalsCount(mindId)

  return (
    <nav aria-label="Places" className="flex flex-col items-center gap-1">
      {NAV_ITEMS.map(({ segment, label, icon: Icon, count }) => {
        const isActive = active === segment
        return (
          <Tooltip key={segment}>
            <TooltipTrigger
              render={
                <Link
                  href={mindHref(mindId, segment)}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex size-11 items-center justify-center rounded-md transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                  )}
                />
              }
            >
              <Icon className="size-5" />
              {count === "approvals" && approvals > 0 && (
                <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-on-brand ring-2 ring-surface">
                  {approvals}
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}

/** Recent chats (#54): under the menu on desktop and tablet, and in the phone drawer. It scrolls with the menu (`SidebarScroll`). */
export function RecentChats({ mindId, onNavigate }: { mindId: string; onNavigate?: () => void }) {
  const { data: chats = [] } = useRecentChats(mindId)
  const pathname = usePathname()
  // The chat the Mind is answering right now, even when another one is open (Ancung, 10 Nov).
  const active = useActiveRun()
  const replying = active?.streaming ? active.threadId : null

  return (
    <section aria-labelledby="recent-chats" className="flex flex-col gap-0.5 pt-2">
      <div className="flex items-center justify-between py-1 pr-1 pl-3">
        <h2 id="recent-chats" className="text-xs font-semibold text-tertiary-foreground">
          Recent chats
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New chat"
          nativeButton={false}
          render={<Link href={mindHref(mindId, "chat")} onClick={onNavigate} />}
        >
          <SquarePenIcon />
        </Button>
      </div>
      <div className="flex flex-col gap-0.5">
        {chats.length === 0 && (
          <p className="px-3 py-2 text-xs text-tertiary-foreground">No chats yet</p>
        )}
        {chats.map((chat) => {
          const href = `${mindHref(mindId, "chat")}/${chat.threadId}`
          const isOpen = pathname === href
          return (
            <Link
              key={chat.threadId}
              href={href}
              onClick={onNavigate}
              aria-current={isOpen ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors",
                isOpen ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-surface-hover"
              )}
            >
              {/* While the Mind answers this chat, its title shimmers and the chat's thinking orb
                  takes the time's place (Ancung, 10 Nov: like "Thinking...", not a green dot). */}
              <span className={cn("min-w-0 flex-1 truncate text-[13px]", replying === chat.threadId && "text-shimmer")}>{chat.title}</span>
              {replying === chat.threadId ? (
                <span role="status" aria-label="Replying" title="Replying" className="flex shrink-0">
                  <ThinkingOrb state="solving" size={20} aria-hidden className="-my-1" />
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-tertiary-foreground">{chat.when}</span>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/**
 * The menu and Recent chats scroll together, with the scrollbar on the sidebar's own edge
 * (Ancung, 9 Nov, like Claude; replaces "only Recent chats scrolls" from 7 Nov). The logo, the
 * Mind and the account stay put.
 */
export function SidebarScroll({ children }: { children: ReactNode }) {
  return (
    <div className="scrollbar-on-hover -mx-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4">
      {children}
    </div>
  )
}
