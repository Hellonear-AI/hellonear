"use client"

import { MenuIcon, NetworkIcon } from "lucide-react"
import { openLiveDrawer } from "@/modules/graph/data/liveDrawer"
import { useState } from "react"
import { AccountMenu } from "@/components/layout/AccountMenu"
import { GettingStarted } from "@/modules/onboarding/components/GettingStarted"
import { Logo } from "@/components/elements/Logo"
import { MindSwitcher } from "@/components/layout/MindSwitcher"
import { NavList, RecentChats, SidebarScroll, useActiveSegment } from "@/components/layout/SidebarParts"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useApprovalsCount } from "@/modules/minds/hooks/useMinds"

/**
 * Phone top bar (design h1yI9, picked over a bottom bar on 6 Nov): the menu and the Mind switcher.
 * The menu opens the left drawer with every place and Recent chats; it carries a dot while
 * something waits for the owner's approval (there is no Approvals page since 11 Nov).
 */
export function MobileHeader({ mindId }: { mindId: string }) {
  const [open, setOpen] = useState(false)
  const segment = useActiveSegment(mindId) || "chat"
  const { data: waiting = 0 } = useApprovalsCount(mindId)
  const close = () => setOpen(false)

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-surface px-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" className="relative" aria-label={waiting > 0 ? `Open the menu, ${waiting} waiting for your approval` : "Open the menu"} />}
        >
          <MenuIcon />
          {/* Something waits for the owner: Recent chats in the menu says where. */}
          {waiting > 0 && <span aria-hidden className="absolute top-2 right-2 size-2 rounded-full bg-warning ring-2 ring-surface" />}
        </SheetTrigger>
        <SheetContent side="left" showCloseButton={false} className="gap-5 overflow-hidden p-4 data-[side=left]:w-[86%] data-[side=left]:max-w-80 data-[side=left]:sm:max-w-80">
          <div className="flex items-center gap-2 py-1 pl-1">
            <SheetTitle className="sr-only">HelloNear menu</SheetTitle>
            <Logo height={32} />
            <span className="flex-1" />
            <AccountMenu variant="icon" />
          </div>
          <SidebarScroll>
            <NavList mindId={mindId} onNavigate={close} />
            <RecentChats mindId={mindId} onNavigate={close} />
          </SidebarScroll>
          <GettingStarted mindId={mindId} onNavigate={close} />
            </SheetContent>
      </Sheet>

      <MindSwitcher mindId={mindId} variant="header" segment={segment} />

      {/* Keeps the Mind switcher centred. */}
      {/* The chat's Live view on phones (it floated over the messages before, 11 Nov); elsewhere
          an empty slot keeps the Mind switcher centred. */}
      {segment === "chat" ? (
        <Button variant="ghost" size="icon" aria-label="Live view" onClick={openLiveDrawer} className="shrink-0">
          <NetworkIcon />
        </Button>
      ) : (
        <span aria-hidden className="size-10 shrink-0" />
      )}
    </header>
  )
}
