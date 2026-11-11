"use client"

import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRef, useState, type ReactNode } from "react"
import { cn } from "cn"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cleanTitle, useThreadActions } from "@/modules/minds/hooks/useThreadActions"
import type { RecentChat } from "@/modules/minds/data/minds"

/**
 * One chat in Recent chats, with a ⋯ menu to rename or delete it (#207, like Claude and ChatGPT):
 * the menu shows on hover or focus in place of the time, and always on touch screens.
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
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-2 pr-10 pl-3"
      >
        <span className={cn("min-w-0 flex-1 truncate text-[13px]", shimmer && "text-shimmer")}>{chat.title}</span>
      </Link>
      <span
        className={cn(
          "pointer-events-none absolute right-3 flex items-center transition-opacity",
          // Keyboard focus only: after the menu closes, focus goes back to ⋯ and a plain focus-within
          // kept the time hidden for good (Ancung, 11 Nov).
          "group-hover/chat:opacity-0 group-has-[:focus-visible]/chat:opacity-0 pointer-coarse:opacity-0",
          menuOpen && "opacity-0"
        )}
      >
        {status}
      </span>
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
