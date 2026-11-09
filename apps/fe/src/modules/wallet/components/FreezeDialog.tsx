"use client"

import { CheckIcon, Loader2Icon, SnowflakeIcon, SunIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ApiError } from "@/lib/api"
import { clockTime } from "@/lib/format"
import { WrongAccountError } from "@/modules/wallet/hooks/useOwnerTransaction"
import { FreezeError, useFreeze } from "@/modules/wallet/hooks/useFreeze"

// W3 Freeze: ask (W3.1), wait for Meteor (W3.2, can't be closed by accident), done (W3.3);
// and the unfreeze ask (W3.4). Copy from the design; the "unfrozen" result isn't designed.

const FREEZE_LINES = (name: string) => [
  { ok: true, text: "Your money stays in the wallet" },
  { ok: true, text: "Waiting approvals stay, but can't be sent" },
  { ok: false, text: `${name}, its skills and Autopilot can't send anything` },
]
const UNFREEZE_LINES = [
  { ok: true, text: "Can pay again, inside the same limits" },
  { ok: true, text: "Waiting approvals can be approved again" },
  { ok: true, text: "Nothing is sent by unfreezing itself" },
]

export function FreezeDialog({
  mindId,
  name,
  freeze: freezeProp,
  open,
  onOpenChange,
}: {
  mindId: string
  name: string
  /** true asks to freeze, false to unfreeze. Read once when the dialog mounts (the parent keys it per opening). */
  freeze: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Fixed for this opening: the wallet flipping behind the dialog must not change what it says.
  const [freeze] = useState(freezeProp)
  const mutation = useFreeze(mindId)
  const [doneAt, setDoneAt] = useState<string | null>(null)
  const signing = mutation.isPending

  // No reset on close: the content stays as it is while the dialog animates out, and the next
  // opening is a fresh dialog (Ancung, 9 Nov: the ask flashed back on Close).
  function close(next: boolean) {
    if (!next && signing) return
    onOpenChange(next)
  }

  const lines = freeze ? FREEZE_LINES(name) : UNFREEZE_LINES.map((l, i) => (i === 0 ? { ...l, text: `${name} ${l.text.toLowerCase()}` } : l))

  return (
    <Dialog open={open} onOpenChange={close} disablePointerDismissal={signing}>
      <DialogContent showCloseButton={!signing}>
        {doneAt ? (
          <>
            <DialogHeader>
              <span className="mb-1 flex size-10 items-center justify-center rounded-md bg-muted">
                {freeze ? <SnowflakeIcon className="size-5 text-foreground" /> : <SunIcon className="size-5 text-foreground" />}
              </span>
              <DialogTitle>{freeze ? "Wallet frozen" : "Wallet unfrozen"}</DialogTitle>
              <DialogDescription>
                {freeze
                  ? `Frozen at ${clockTime(doneAt)}. Nothing can leave ${name}'s wallet until you unfreeze it.`
                  : `Unfrozen at ${clockTime(doneAt)}. ${name} can pay again, only inside your limits.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <span className="mb-1 flex size-10 items-center justify-center rounded-md bg-danger-soft">
                <SnowflakeIcon className="size-5 text-danger" />
              </span>
              <DialogTitle>{freeze ? `Freeze ${name}'s wallet?` : `Unfreeze ${name}'s wallet?`}</DialogTitle>
              <DialogDescription>
                {freeze ? "Every payment stops right away. You can unfreeze any time." : `${name} will be able to spend again, only inside your limits.`}
              </DialogDescription>
            </DialogHeader>
            <ul className="flex flex-col gap-2 rounded-md bg-muted px-4 py-3 text-[13px] text-foreground">
              {lines.map((l) => (
                <li key={l.text} className="flex items-center gap-2">
                  {l.ok ? <CheckIcon className="size-3.5 shrink-0 text-success" /> : <XIcon className="size-3.5 shrink-0 text-danger" />}
                  {l.text}
                </li>
              ))}
            </ul>
            {mutation.error ? (
              <p role="alert" className="text-[13px] text-danger">
                {freezeErrorText(mutation.error, freeze)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {freeze ? "Freezing needs your signature in Meteor. It's free on testnet." : "Unfreezing needs your signature in Meteor."}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" autoFocus disabled={signing} onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                variant={freeze ? "destructive" : "default"}
                disabled={signing}
                onClick={() => mutation.mutate(freeze, { onSuccess: ({ at }) => setDoneAt(at) })}
              >
                {signing ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <SnowflakeIcon />}
                {signing ? "Waiting for Meteor" : mutation.error ? "Try again" : freeze ? "Freeze with Meteor" : "Unfreeze with Meteor"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function freezeErrorText(err: unknown, freeze: boolean): string {
  const what = freeze ? "frozen" : "unfrozen"
  if (err instanceof FreezeError) {
    if (err.step === "sign" && err.cause instanceof WrongAccountError) {
      return `Your wallet is signed in as ${err.cause.actual.join(", ") || "another account"}. Switch it to ${err.cause.expected}, then try again.`
    }
    if (err.step === "sign") return `Meteor didn't sign, so the wallet wasn't ${what}.`
    if (err.step === "check") return `Meteor signed, but the wallet doesn't show it yet. Check again in a moment.`
    if (err.cause instanceof ApiError && err.cause.code === "demo_not_allowed") return "Connect a wallet to do this."
  }
  return `Could not reach the wallet service, so nothing changed. Please try again later.`
}
