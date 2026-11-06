"use client"

import { PanelLeftCloseIcon, PanelLeftOpenIcon, SproutIcon } from "lucide-react"
import Link from "next/link"
import { AccountMenu } from "@/components/layout/AccountMenu"
import { MindSwitcher } from "@/components/layout/MindSwitcher"
import { NavList, RailNav, RecentChats, TestnetNotice, useActiveSegment } from "@/components/layout/SidebarParts"
import { Button } from "@/components/ui/button"

// Placeholder mark until Nabil's logo lands (design/CLAUDE.md).
export function LogoMark({ size = 24 }: { size?: 24 | 32 }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center bg-primary"
      style={{ width: size, height: size, borderRadius: size === 24 ? 7 : 9 }}
    >
      <SproutIcon className="text-brand" style={{ width: size / 2, height: size / 2 }} />
    </span>
  )
}

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
    <div className="flex h-full w-64 flex-col gap-5 border-r border-border bg-surface p-4">
      <div className="flex items-center gap-2 py-1 pl-2">
        <Link href={`/minds/${mindId}/chat`} onClick={onNavigate} className="flex items-center gap-2">
          <LogoMark />
          <span className="text-[15px] font-semibold">HelloNear</span>
        </Link>
        <span className="flex-1" />
        {onFold && (
          <Button variant="ghost" size="icon-sm" aria-label="Fold the sidebar" onClick={onFold}>
            <PanelLeftCloseIcon />
          </Button>
        )}
      </div>
      <MindSwitcher mindId={mindId} variant="card" segment={segment} />
      <NavList mindId={mindId} onNavigate={onNavigate} />
      <RecentChats mindId={mindId} onNavigate={onNavigate} />
      <TestnetNotice />
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
      <LogoMark size={32} />
      <MindSwitcher mindId={mindId} variant="avatar" segment={segment} />
      <div className="flex-1">
        <RailNav mindId={mindId} />
      </div>
      <AccountMenu variant="avatar" />
    </div>
  )
}
