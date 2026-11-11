"use client"

import { SquarePenIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { ThinkingOrb } from "thinking-orbs"
import { cn } from "cn"
import { mindHref, NAV_ITEMS } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useApprovals, useRecentChats } from "@/modules/minds/hooks/useMinds"
import { useActiveRun } from "@/modules/chat/hooks/ChatRunProvider"
import { ChatRow } from "@/components/layout/ChatRow"

export function useActiveSegment(mindId: string) {
  const pathname = usePathname()
  const prefix = `/minds/${mindId}/`
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length).split("/")[0] : ""
}

/** Nav/Default, Nav/Active and Nav/With count from the design: 40 px rows, 18 px icons. */
export function NavList({ mindId, onNavigate }: { mindId: string; onNavigate?: () => void }) {
  const active = useActiveSegment(mindId)

  return (
    <nav aria-label="Places" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ segment, label, icon: Icon }) => {
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
          </Link>
        )
      })}
    </nav>
  )
}

/** Icon-only nav for the rail (72 px): 44 px buttons with a tooltip. */
export function RailNav({ mindId }: { mindId: string }) {
  const active = useActiveSegment(mindId)

  return (
    <nav aria-label="Places" className="flex flex-col items-center gap-1">
      {NAV_ITEMS.map(({ segment, label, icon: Icon }) => {
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
  // Chats paused on an approval (Ancung, 11 Nov: no Approvals page; the chat says it waits, and
  // its card answers there). They go to the top of the list.
  const waitingIn = new Set((useApprovals(mindId).data ?? []).map((a) => a.threadId))
  const listed = [...chats].sort((a, b) => Number(waitingIn.has(b.threadId)) - Number(waitingIn.has(a.threadId)))

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
        {listed.map((chat) => {
          const href = `${mindHref(mindId, "chat")}/${chat.threadId}`
          const isOpen = pathname === href
          const replyingHere = replying === chat.threadId
          return (
            <ChatRow
              key={chat.threadId}
              mindId={mindId}
              chat={chat}
              href={href}
              isOpen={isOpen}
              busy={replyingHere || waitingIn.has(chat.threadId)}
              shimmer={replyingHere}
              onNavigate={onNavigate}
              status={
                // While the Mind answers this chat, its title shimmers and the chat's thinking orb
                // takes the time's place (Ancung, 10 Nov: like "Thinking...", not a green dot).
                replyingHere ? (
                  <span role="status" aria-label="Replying" title="Replying" className="flex shrink-0">
                    <ThinkingOrb state="solving" size={20} aria-hidden className="-my-1" />
                  </span>
                ) : waitingIn.has(chat.threadId) ? (
                  <span role="status" title="Waiting for your approval" className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-warning">
                    <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                    Waiting
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-tertiary-foreground">{chat.when}</span>
                )
              }
            />
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
  // The menu fades out at the top and bottom where more of it is hidden, like the chat under its
  // header and into the composer (Ancung, 11 Nov). Overlays in the sidebar's colour, stopping
  // short of the scrollbar; each shows only when there is something to scroll to on that side.
  const box = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ above: false, below: false })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => {
      const above = el.scrollTop > 1
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1
      setMore((m) => (m.above === above && m.below === below ? m : { above, below }))
    }
    read()
    el.addEventListener("scroll", read, { passive: true })
    const ro = new ResizeObserver(read)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => {
      el.removeEventListener("scroll", read)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="relative -mx-4 flex min-h-0 flex-1 flex-col">
      <div ref={box} className="scrollbar-on-hover flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4">
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 right-3 left-0 h-6 bg-gradient-to-b from-surface to-transparent transition-opacity duration-200",
          more.above ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-3 bottom-0 left-0 h-8 bg-gradient-to-t from-surface to-transparent transition-opacity duration-200",
          more.below ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  )
}
