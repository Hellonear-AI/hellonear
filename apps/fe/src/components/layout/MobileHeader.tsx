"use client"

import { InboxIcon, MenuIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { AccountMenu } from "@/components/layout/AccountMenu"
import { LogoMark } from "@/components/layout/AppSidebar"
import { MindSwitcher } from "@/components/layout/MindSwitcher"
import { mindHref } from "@/components/layout/nav"
import { NavList, RecentChats, TestnetNotice, useActiveSegment } from "@/components/layout/SidebarParts"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useApprovalsCount } from "@/modules/minds/hooks/useMinds"

/**
 * Phone top bar (design h1yI9, picked over a bottom bar on 6 Nov): menu, Mind switcher,
 * Approvals with its count. The menu opens the left drawer with every place and Recent chats.
 */
export function MobileHeader({ mindId }: { mindId: string }) {
  const [open, setOpen] = useState(false)
  const segment = useActiveSegment(mindId) || "chat"
  const { data: approvals = 0 } = useApprovalsCount(mindId)
  const close = () => setOpen(false)

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-surface px-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open the menu" />}>
          <MenuIcon />
        </SheetTrigger>
        <SheetContent side="left" showCloseButton={false} className="gap-5 p-4 data-[side=left]:w-[86%] data-[side=left]:max-w-80 data-[side=left]:sm:max-w-80">
          <div className="flex items-center gap-2 py-1 pl-2">
            <LogoMark />
            <SheetTitle className="text-[15px] font-semibold">HelloNear</SheetTitle>
            <span className="flex-1" />
            <AccountMenu variant="icon" />
          </div>
          <NavList mindId={mindId} onNavigate={close} />
          <RecentChats mindId={mindId} onNavigate={close} />
          <TestnetNotice />
        </SheetContent>
      </Sheet>

      <MindSwitcher mindId={mindId} variant="header" segment={segment} />

      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={approvals > 0 ? `Approvals, ${approvals} waiting` : "Approvals"}
        render={<Link href={mindHref(mindId, "approvals")} />}
      >
        <InboxIcon />
        {approvals > 0 && (
          <span className="absolute top-1 right-1 flex size-[18px] items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-on-brand ring-2 ring-surface">
            {approvals}
          </span>
        )}
      </Button>
    </header>
  )
}
