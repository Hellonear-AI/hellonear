"use client"

import { XIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

/** Settings for the picked block: a side panel on desktop, a bottom sheet on phones (B1.5). */
export function SettingsFrame({ desktop, onClose, children }: { desktop: boolean; onClose: () => void; children: ReactNode }) {
  if (desktop) {
    return (
      <aside className="relative flex shrink-0 flex-col gap-4 border-border p-4 lg:w-[340px] lg:overflow-y-auto lg:border-l">
        <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Close the settings (Esc)" title="Close (Esc)" onClick={onClose}>
          <XIcon />
        </Button>
        {children}
      </aside>
    )
  }
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[85dvh] gap-0 rounded-t-xl p-0">
        <SheetTitle className="sr-only">Block settings</SheetTitle>
        <div className="relative flex flex-col gap-4 overflow-y-auto p-4">
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Close" onClick={onClose}>
            <XIcon />
          </Button>
          {children}
        </div>
        <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
