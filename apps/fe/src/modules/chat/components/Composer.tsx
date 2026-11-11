"use client"

import { ArrowUpIcon, SquareIcon } from "lucide-react"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"
import { readPref, writePref } from "@/lib/storage"
import { MEDIA, matches } from "@/lib/media"
import { BorderBeam } from "border-beam"
import { useTheme } from "next-themes"

/**
 * The message box (C1.1). Enter sends, Shift+Enter adds a line. While the Mind replies, the send
 * button becomes Stop (#121), like Claude and ChatGPT.
 */
export function Composer({
  name,
  busy,
  note,
  onSend,
  onStop,
  stopping = false,
  draftKey,
  locked,
}: {
  name: string
  busy: boolean
  note: string
  onSend: (message: string) => void
  /** Stops the reply in progress; without it the button just waits. */
  onStop?: () => void
  /** Stop was pressed; the button waits for the run to end. */
  stopping?: boolean
  /** Where the unsent text is kept on this device, one per chat (Ancung, 10 Nov, like Claude). */
  draftKey?: string
  /** Why nothing can be sent (a try-out with no messages left, T1.5): the box shows this and locks. */
  locked?: string
}) {
  const [value, setValue] = useState("")
  const input = useRef<HTMLTextAreaElement>(null)
  // The unsent text stays per chat: leave a chat and come back, it is still there.
  useEffect(() => {
    const saved = draftKey ? (readPref(draftKey) ?? "") : ""
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once per chat from this device
    setValue(saved)
    // Opening a chat puts the cursor in the box, at the end of any draft, like Claude and ChatGPT
    // (Ancung, 11 Nov). Not on touch screens: it would pop the keyboard over half the chat.
    const box = input.current
    if (!box || locked || matches(MEDIA.coarse)) return
    const frame = requestAnimationFrame(() => {
      box.focus({ preventScroll: true })
      box.setSelectionRange(box.value.length, box.value.length)
    })
    return () => cancelAnimationFrame(frame)
    // Only when the chat changes, not on every lock change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])
  const change = (next: string) => {
    setValue(next)
    if (!draftKey) return
    writePref(draftKey, next.trim() ? next : null)
  }
  const message = value.trim()
  const canSend = !busy && !locked && message.length > 0
  const { resolvedTheme } = useTheme()

  function send() {
    if (!canSend) return
    onSend(message)
    change("")
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      className="flex w-full flex-col gap-2"
    >
      {/* A beam travels along the box's bottom edge only while the Mind replies (Ancung, 11 Nov),
          like "Thinking...": off otherwise, so nothing moves while the owner types. */}
      <BorderBeam size="line" colorVariant="mono" staticColors active={busy} theme={resolvedTheme === "light" ? "light" : "dark"} strength={1} brightness={1.8} className="composer-beam">
            <div className="flex w-full items-end gap-2 rounded-[24px] border border-input bg-surface py-2 pr-2 pl-[18px] transition-[border-color,box-shadow] duration-150 ease-out focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-background">
        <label htmlFor="chat-message" className="sr-only">
          Message {name}
        </label>
        <textarea
          ref={input}
          id="chat-message"
          value={value}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={4000}
          placeholder={locked ?? (stopping ? "Stopping..." : busy ? `${name} is replying` : `Message ${name}`)}
          disabled={Boolean(locked)}
          className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-base text-foreground outline-none placeholder:text-tertiary-foreground md:text-[15px]"
        />
        {busy && onStop ? (
          <Button type="button" size="icon" onClick={onStop} disabled={stopping} aria-label={stopping ? "Stopping" : `Stop ${name}'s reply`} title={stopping ? "Stopping" : "Stop"}>
            {stopping ? <Spinner /> : <SquareIcon className="fill-current" />}
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!canSend} aria-label="Send">
            <ArrowUpIcon />
          </Button>
        )}
      </div>
      </BorderBeam>
      <p className="text-center text-xs text-muted-foreground">{note}</p>
    </form>
  )
}
