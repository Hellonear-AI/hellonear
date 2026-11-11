"use client"

import type { ReactNode } from "react"
import { cn } from "cn"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { MEDIA } from "@/lib/media"

/**
 * A dialog on tablets and desktops, a drawer from the bottom on phones that swipes down to close
 * (below 768 px, like "Add a block" and the live view; Ancung, 11 Nov). While `busy`, it can't be
 * closed. The footer's buttons stack on phones, the main one on top.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  busy = false,
  title,
  description,
  children,
  footer,
  top,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy?: boolean
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** Above the title, like an illustration. */
  top?: ReactNode
}) {
  const wide = useMediaQuery(MEDIA.md, true)
  const change = (next: boolean) => {
    if (!next && busy) return
    onOpenChange(next)
  }

  if (wide) {
    return (
      <Dialog open={open} onOpenChange={change} disablePointerDismissal={busy}>
        <DialogContent showCloseButton={!busy}>
          {top}
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          {footer && <DialogFooter>{footer}</DialogFooter>}
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer open={open} onOpenChange={change} showSwipeHandle>
      {/* Roomy on phones (Ancung, 11 Nov: the drawers felt cramped), the same spacing as Welcome. */}
      <DrawerContent className="gap-5 px-5 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {top}
        <DrawerHeader className="gap-2 p-0 text-left">
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        {children}
        {footer && <div className={cn("flex flex-col-reverse gap-3 pt-2 [&>*]:w-full")}>{footer}</div>}
      </DrawerContent>
    </Drawer>
  )
}
