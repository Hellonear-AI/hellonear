"use client"

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react"
import Link from "next/link"
import { Logo, LogoIcon } from "@/components/elements/Logo"
import { AccountMenu } from "@/components/layout/AccountMenu"
import { MindSwitcher } from "@/components/layout/MindSwitcher"
import { NavList, RailNav, RecentChats, SidebarScroll, useActiveSegment } from "@/components/layout/SidebarParts"
import { Button } from "@/components/ui/button"

/** Full sidebar (256 px): design AuOSf. `onFold` shows the fold button (desktop), `onNavigate` closes an overlay. */
export function AppSidebar({
  mindId,
  onFold,
  onNavigate,
}: {
  mindId: string
  onFold?: () => void
  onNavigate?: () => void
}) {
  const segment = useActiveSegment(mindId) || "chat"
  return (
    // The menu and Recent chats scroll together (SidebarScroll); logo, Mind and account stay put.
    <div className="flex h-full w-64 flex-col gap-5 overflow-hidden border-r border-border bg-surface p-4">
      <div className="flex items-center gap-2 py-1">
        <Link href={`/minds/${mindId}/chat`} onClick={onNavigate} aria-label="HelloNear, go to chat" className="rounded-sm">
          <Logo height={36} />
        </Link>
        <span className="flex-1" />
        {onFold && (
          <Button variant="ghost" size="icon-sm" aria-label="Fold the sidebar" onClick={onFold}>
            <PanelLeftCloseIcon />
          </Button>
        )}
      </div>
      <MindSwitcher mindId={mindId} variant="card" segment={segment} />
      <SidebarScroll>
        <NavList mindId={mindId} onNavigate={onNavigate} />
        <RecentChats mindId={mindId} onNavigate={onNavigate} />
      </SidebarScroll>
      <AccountMenu variant="row" />
    </div>
  )
}

/** Icon rail (72 px): design lspo5. Tablet default, and desktop after folding. */
export function AppRail({ mindId, onExpand }: { mindId: string; onExpand: () => void }) {
  const segment = useActiveSegment(mindId) || "chat"
  return (
    <div className="flex h-full w-18 flex-col items-center gap-4 border-r border-border bg-surface px-3 py-4">
      <Button variant="ghost" size="icon" aria-label="Open the sidebar" onClick={onExpand}>
        <PanelLeftOpenIcon />
      </Button>
      <LogoIcon size={40} />
      <MindSwitcher mindId={mindId} variant="avatar" segment={segment} />
      <div className="flex-1">
        <RailNav mindId={mindId} />
      </div>
      <AccountMenu variant="avatar" />
    </div>
  )
}
