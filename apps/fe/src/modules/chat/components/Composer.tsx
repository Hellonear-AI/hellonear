"use client"

import { ArrowUpIcon, Loader2Icon } from "lucide-react"
import { useState, type KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"

/** The message box (C1.1). Enter sends, Shift+Enter adds a line. While the Mind replies it waits. */
export function Composer({
  name,
  busy,
  note,
  onSend,
}: {
  name: string
  busy: boolean
  note: string
  onSend: (message: string) => void
}) {
  const [value, setValue] = useState("")
  const message = value.trim()
  const canSend = !busy && message.length > 0

  function send() {
    if (!canSend) return
    onSend(message)
    setValue("")
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
      <div className="flex w-full items-end gap-2 rounded-[24px] border border-input bg-surface py-2 pr-2 pl-[18px] transition-[border-color,box-shadow] duration-150 ease-out focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-background">
        <label htmlFor="chat-message" className="sr-only">
          Message {name}
        </label>
        <textarea
          id="chat-message"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={4000}
          placeholder={busy ? `${name} is replying` : `Message ${name}`}
          className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-base text-foreground outline-none placeholder:text-tertiary-foreground md:text-[15px]"
        />
        <Button type="submit" size="icon" disabled={!canSend} aria-label={busy ? `${name} is replying` : "Send"}>
          {busy ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <ArrowUpIcon />}
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">{note}</p>
    </form>
  )
}
