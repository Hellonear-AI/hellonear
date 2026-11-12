"use client"

import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { prefersReducedMotion } from "@/lib/media"
import { cn } from "cn"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cleanTitle, useThreadActions } from "@/modules/minds/hooks/useThreadActions"
import type { RecentChat } from "@/modules/minds/data/minds"

/**
 * One chat in Recent chats, with a ⋯ menu to rename or delete it (#207, like Claude and ChatGPT):
 * the menu shows on hover or focus in place of the time, and always on touch screens, beside the
 * thinking orb or "Waiting" when the chat is busy.
 */
export function ChatRow({
  mindId,
  chat,
  href,
  isOpen,
  busy,
  status,
  shimmer,
  onNavigate,
}: {
  mindId: string
  chat: RecentChat
  href: string
  isOpen: boolean
  /** The Mind is replying in it or waits for an approval there: deleting it is refused. */
  busy: boolean
  /** What sits at the right: the time, "Waiting" or the thinking orb. */
  status: ReactNode
  shimmer: boolean
  onNavigate?: () => void
}) {
  const { rename, remove } = useThreadActions(mindId)
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)

  if (editing) {
    return (
      <RenameField
        initial={chat.title}
        onDone={(title) => {
          setEditing(false)
          if (title && title !== chat.title) rename.mutate({ threadId: chat.threadId, title })
        }}
      />
    )
  }

  return (
    <div
      className={cn(
        "group/chat relative flex items-center rounded-md transition-colors",
        isOpen ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-surface-hover"
      )}
    >
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={isOpen ? "page" : undefined}
        className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-2 pr-3 pl-3", busy && "pointer-coarse:pr-9")}
      >
        <MarqueeTitle title={chat.title} shimmer={shimmer} />
        {/* In the row's flow, so the title stops before it (Ancung, 11 Nov: "Yesterday" ran over a
            long title when it floated). At least as wide as ⋯, which takes its place on hover.
            On touch screens ⋯ always shows, so the time hides there; but the thinking orb and
            "Waiting" stay, beside ⋯ (Ancung, 12 Nov: on a phone they never showed). */}
        <span
          className={cn(
            "flex min-w-6 shrink-0 items-center justify-end transition-opacity",
            // Keyboard focus only: after the menu closes, focus goes back to ⋯ and a plain focus-within
            // kept the time hidden for good (Ancung, 11 Nov).
            busy
              ? // A touch leaves :hover stuck on the row, so only a mouse swaps the orb for ⋯.
                "pointer-fine:group-hover/chat:opacity-0 pointer-fine:group-has-[:focus-visible]/chat:opacity-0"
              : "group-hover/chat:opacity-0 group-has-[:focus-visible]/chat:opacity-0 pointer-coarse:opacity-0",
            menuOpen && "opacity-0"
          )}
        >
          {status}
        </span>
      </Link>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`More for ${chat.title}`}
              className={cn(
                "absolute right-1 size-7 opacity-0 transition-opacity hover:bg-muted aria-expanded:bg-muted aria-expanded:opacity-100",
                "group-hover/chat:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              )}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="w-44 p-1.5">
          <DropdownMenuItem className="gap-2.5 px-3 py-2.5" onClick={() => setEditing(true)}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" className="gap-2.5 px-3 py-2.5" onClick={() => setConfirm(true)}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this chat?</DialogTitle>
            <DialogDescription>
              &ldquo;{chat.title}&rdquo; and its messages are removed, and the Mind forgets it. Payments it made stay in Wallet. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {busy && <p className="text-[13px] text-warning">The Mind is still working in this chat. Stop the reply or answer its approval first.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || remove.isPending}
              onClick={() => remove.mutate(chat.threadId, { onSettled: () => setConfirm(false) })}
            >
              {remove.isPending && <Spinner />}
              Delete chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The title, edited in place: Enter or leaving the field saves, Esc keeps the old one. */
function RenameField({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial)
  // Enter, then the blur that unmounting brings, must save once.
  const done = useRef(false)
  const finish = (title: string | null) => {
    if (done.current) return
    done.current = true
    onDone(title)
  }
  return (
    <input
      autoFocus
      aria-label="Chat title"
      value={value}
      maxLength={60}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(cleanTitle(value))
        if (e.key === "Escape") finish(null)
      }}
      onBlur={() => finish(cleanTitle(value))}
      className="h-9 w-full rounded-md border border-ring bg-background px-3 text-[13px] text-foreground outline-none"
    />
  )
}

/** Pixels a second while a cut-off title runs, and the space before it comes round again. */
const MARQUEE_SPEED = 28
const MARQUEE_GAP = 32
/** It waits this long under the pointer before it starts, so passing over a row moves nothing. */
const MARQUEE_DELAY = 100
/** When the pointer leaves, the title glides home this fast, then "…" comes back. */
const MARQUEE_HOME = 350

/**
 * The chat's title, cut off with "…" at rest. While the row is hovered (or focused from the
 * keyboard), a title too long for the row waits a moment, then runs like a ticker and loops: as
 * its end passes, its start follows again after a short gap (Ancung, 11 Nov). Leaving glides it to
 * whichever start is nearer instead of jumping back. A title that fits never moves; reduced
 * motion keeps it still.
 */
function MarqueeTitle({ title, shimmer }: { title: string; shimmer: boolean }) {
  const box = useRef<HTMLSpanElement>(null)
  const track = useRef<HTMLSpanElement>(null)
  const loop = useRef<Animation | null>(null)
  // The title's full width while it runs, 0 when it is still.
  const [width, setWidth] = useState(0)
  const lap = width + MARQUEE_GAP

  // Start the loop once the two copies are on screen.
  useEffect(() => {
    const t = track.current
    if (!width || !t) return
    const a = t.animate([{ transform: "translateX(0)" }, { transform: `translateX(-${lap}px)` }], {
      duration: (lap / MARQUEE_SPEED) * 1000,
      delay: MARQUEE_DELAY,
      iterations: Infinity,
      easing: "linear",
    })
    loop.current = a
    return () => a.cancel()
  }, [width, lap])

  const start = () => {
    const b = box.current
    if (!b || prefersReducedMotion() || width) return
    // The box's own scroll width: the inline text inside reports 0.
    if (b.scrollWidth - b.clientWidth > 2) setWidth(b.scrollWidth)
  }
  const stop = () => {
    const t = track.current
    const a = loop.current
    if (!t || !a || !width) return setWidth(0)
    // Where it is now, then home to the nearer start: back to 0, or on to one lap (the second
    // copy sits where the first began, so both read the same).
    const x = new DOMMatrixReadOnly(getComputedStyle(t).transform).m41
    a.cancel()
    loop.current = null
    const home = -x > lap / 2 ? -lap : 0
    t.animate([{ transform: `translateX(${x}px)` }, { transform: `translateX(${home}px)` }], {
      duration: MARQUEE_HOME,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      fill: "forwards",
    }).finished.then(
      () => setWidth(0),
      () => setWidth(0)
    )
  }

  return (
    <span
      ref={box}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
      className={cn(
        "min-w-0 flex-1 overflow-hidden text-[13px] whitespace-nowrap",
        width
          ? "[mask-image:linear-gradient(to_right,transparent,black_10px,black_calc(100%_-_10px),transparent)]"
          : cn("text-ellipsis", shimmer && "text-shimmer")
      )}
    >
      {width ? (
        // Two copies one gap apart; moving one lap left lands the second where the first began,
        // so the loop has no seam.
        <span ref={track} className={cn("inline-flex", shimmer && "text-shimmer")} style={{ gap: MARQUEE_GAP }}>
          <span>{title}</span>
          <span aria-hidden>{title}</span>
        </span>
      ) : (
        title
      )}
    </span>
  )
}
