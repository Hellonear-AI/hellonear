"use client"

import { useEffect, useState, type ReactNode } from "react"
import { cn } from "cn"
import { AppRail, AppSidebar } from "@/components/layout/AppSidebar"
import { MobileHeader } from "@/components/layout/MobileHeader"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { readPref, writePref } from "@/lib/storage"

const FOLD_KEY = "hellonear.sidebar.folded"

/**
 * The app frame around every Mind screen (design N1):
 * - phone (< 768): top bar + left drawer;
 * - tablet (768 to 1279): icon rail; its top button opens the full sidebar over the page;
 * - desktop (1280+): full sidebar with a fold button that turns it into the rail (remembered).
 */
export function AppShell({ mindId, children }: { mindId: string; children: ReactNode }) {
  const [folded, setFolded] = useState(false)
  // No fold animation until the saved choice is applied, so the sidebar doesn't fold itself on load.
  const [animate, setAnimate] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)

  // Read the saved choice after mount so the server and first client render match.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of localStorage
    setFolded(readPref(FOLD_KEY) === "1")
    const frame = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  function setFold(next: boolean) {
    setFolded(next)
    writePref(FOLD_KEY, next ? "1" : "0")
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop. Folding slides the width 256 <-> 72 (on-screen movement: ease-in-out, 200 ms)
          and crossfades the full sidebar with the rail; the page widens with it. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 overflow-hidden xl:block",
          folded ? "w-18" : "w-64",
          animate && "transition-[width] duration-200 ease-in-out motion-reduce:transition-none"
        )}
      >
        <div
          inert={folded}
          className={cn(
            "absolute inset-y-0 left-0 transition-opacity duration-150 ease-out motion-reduce:transition-none",
            folded ? "opacity-0" : "opacity-100 delay-50"
          )}
        >
          <AppSidebar mindId={mindId} onFold={() => setFold(true)} />
        </div>
        <div
          inert={!folded}
          className={cn(
            "absolute inset-y-0 left-0 transition-opacity duration-150 ease-out motion-reduce:transition-none",
            folded ? "opacity-100 delay-50" : "opacity-0"
          )}
        >
          <AppRail mindId={mindId} onExpand={() => setFold(false)} />
        </div>
      </aside>

      {/* Tablet */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 md:block xl:hidden">
        <AppRail mindId={mindId} onExpand={() => setOverlayOpen(true)} />
      </aside>
      <Sheet open={overlayOpen} onOpenChange={setOverlayOpen}>
        <SheetContent side="left" showCloseButton={false} className="gap-0 border-0 p-0 data-[side=left]:border-r-0 data-[side=left]:w-auto data-[side=left]:sm:max-w-none xl:hidden">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <AppSidebar mindId={mindId} onFold={() => setOverlayOpen(false)} onNavigate={() => setOverlayOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone */}
        <div className="md:hidden">
          <MobileHeader mindId={mindId} />
        </div>
        <main id="main-content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
