"use client"

import { PenLineIcon, PlusIcon, XIcon } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"
import { cn } from "cn"
import { Spinner } from "@/components/elements/Spinner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { compareNear } from "@/lib/near"
import { addressError, DEFAULT_PER_PAYMENT, MAX_ADDRESSES, normalizeAccount, perPaymentError } from "@/modules/minds/data/limits"
import type { ApiWallet } from "@/modules/wallet/api"
import { walletActionText } from "@/modules/wallet/data/errors"
import { useSaveLimits } from "@/modules/wallet/hooks/useWalletActions"

/**
 * W2 Change limits (a dialog; the design's phone sheet is the same content). Changed values show
 * what they were, new addresses are marked until saved, a one-line summary says what the Mind
 * may do after saving, and Save asks Meteor (W2.4) before anything changes. With no wallet or
 * no limits yet (W1.6) it sets them up, creating the wallet first if there is none.
 * The parent gives it a new `key` each time it opens, so it starts from what is saved.
 */
export function LimitsDialog({
  mindId,
  name,
  wallet,
  open,
  onOpenChange,
}: {
  mindId: string
  name: string
  /** null: no wallet yet. */
  wallet: ApiWallet | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const save = useSaveLimits(mindId)
  const was = wallet?.policy?.perTransactionNear ?? null
  const before = wallet?.policy?.whitelist ?? []
  const setUp = !wallet || !wallet.policy?.perTransactionNear
  const [perPayment, setPerPayment] = useState(was ?? DEFAULT_PER_PAYMENT)
  const [addresses, setAddresses] = useState<string[]>(before)
  const [draft, setDraft] = useState("")
  const perPaymentId = useId()
  const draftId = useId()
  const signing = save.isPending

  const limitError = perPaymentError(perPayment)
  const draftError = draft.trim() ? addressError(draft, addresses) : null
  const changedLimit = was !== null && !limitError && compareNear(perPayment.trim(), was) !== 0
  const count = addresses.length
  const blocker = limitError ? "Fix the per payment limit first" : count === 0 ? "Add at least one address first" : null

  function addDraft() {
    if (!draft.trim() || draftError || count >= MAX_ADDRESSES) return
    setAddresses([...addresses, normalizeAccount(draft)])
    setDraft("")
  }

  function close(next: boolean) {
    if (!next && signing) return
    onOpenChange(next)
  }

  function submit() {
    if (blocker || signing) return
    const limits = { perTransactionNear: perPayment.trim(), whitelist: addresses }
    save.mutate(
      { limits, createWallet: !wallet },
      {
        onSuccess: () => {
          onOpenChange(false)
          toast.success("Limits saved", { description: `Up to ${limits.perTransactionNear} NEAR per payment.` })
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={close} disablePointerDismissal={signing}>
      <DialogContent showCloseButton={!signing} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{setUp ? `Set ${name}'s limits` : `Change ${name}'s limits`}</DialogTitle>
          <DialogDescription>{name} can&apos;t change these. Saving asks Meteor for your signature.</DialogDescription>
        </DialogHeader>

        <form
          id="limits-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <fieldset disabled={signing} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <label htmlFor={perPaymentId} className="text-sm font-medium text-foreground">
                  Per payment
                </label>
                {changedLimit && <Badge variant="neutral">Was {was}</Badge>}
              </div>
              <div
                className={cn(
                  "flex h-11 items-center gap-2 rounded-md border bg-surface px-3.5 transition-[border-color,box-shadow] duration-150 ease-out focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-background",
                  limitError ? "border-danger" : changedLimit ? "border-foreground" : "border-input"
                )}
              >
                <input
                  id={perPaymentId}
                  value={perPayment}
                  onChange={(e) => setPerPayment(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={Boolean(limitError) || undefined}
                  className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none md:text-[15px]"
                />
                <span className="text-sm font-medium text-muted-foreground">NEAR</span>
              </div>
              <p className={cn("text-xs", limitError ? "text-danger" : "text-muted-foreground")}>
                {limitError ?? "Bigger payments are blocked. Every payment asks you first."}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Who {name} may pay</p>
                <span className="text-xs text-muted-foreground">
                  {count} {count === 1 ? "address" : "addresses"}
                </span>
              </div>
              {count > 0 && (
                <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                  {addresses.map((a) => (
                    <li key={a} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">{a}</span>
                      {!before.includes(a) && <Badge variant="info">New</Badge>}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${a}`}
                        onClick={() => setAddresses(addresses.filter((x) => x !== a))}
                      >
                        <XIcon />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {count < MAX_ADDRESSES && (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <label htmlFor={draftId} className="sr-only">
                      New address
                    </label>
                    <Input
                      id={draftId}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addDraft()
                        }
                      }}
                      placeholder="name.testnet"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-invalid={Boolean(draftError) || undefined}
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={addDraft} disabled={!draft.trim() || Boolean(draftError)}>
                      <PlusIcon />
                      Add
                    </Button>
                  </div>
                  {draftError && (
                    <p className="text-xs text-danger">
                      {draftError === "Already in the list." ? draftError : "Enter a valid NEAR address, for example name.testnet."}
                    </p>
                  )}
                </div>
              )}
            </div>

            <p className="rounded-md bg-brand-soft px-3.5 py-2.5 text-[13px] text-foreground">
              {blocker ??
                `After saving: ${name} asks before every payment, up to ${perPayment.trim()} NEAR each, only to ${
                  count === 1 ? "this address" : `these ${count} addresses`
                }.`}
            </p>

            {save.error && (
              <p role="alert" className="text-[13px] text-danger">
                {walletActionText(save.error, "limits")}
              </p>
            )}
          </fieldset>
        </form>

        <DialogFooter>
          <Button variant="outline" disabled={signing} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="limits-form" disabled={signing || Boolean(blocker)}>
            {signing ? <Spinner /> : <PenLineIcon />}
            {signing ? "Waiting for Meteor" : save.error ? "Try again" : "Save and sign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
