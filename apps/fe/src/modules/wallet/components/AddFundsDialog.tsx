"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowUpRightIcon, CheckIcon, CopyIcon, Loader2Icon, SendIcon } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatNear } from "@/lib/format"
import { compareNear, toYocto } from "@/lib/near"
import { useSession } from "@/modules/auth/hooks/useSession"
import type { ApiWallet } from "@/modules/minds/api"
import { ownerAvailableNear } from "@/modules/wallet/api"
import { shortAddress } from "@/modules/wallet/data/address"
import { walletActionText } from "@/modules/wallet/data/errors"
import { useAddFunds } from "@/modules/wallet/hooks/useWalletActions"

const QUICK = ["1", "2", "5"]
const FAUCET_URL = "https://docs.near.org/getting-started/faucet"

/**
 * W4 Add funds: the amount first with quick picks, From and To spelled out, the owner's own
 * balance checked before Meteor opens (W4.3), everything locked while Meteor signs (W4.2), then
 * a toast with the new balance (W4.4). The transfer goes from the owner's wallet straight to
 * the Mind's address; the backend isn't involved. Quick picks are 1, 2, 5 NEAR, not the
 * design's 5, 10, 20: the testnet faucet gives 5 NEAR at a time.
 */
export function AddFundsDialog({
  mindId,
  name,
  wallet,
  open,
  onOpenChange,
}: {
  mindId: string
  name: string
  wallet: ApiWallet
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const owner = useSession().data?.nearAccountId ?? null
  const available = useQuery({
    queryKey: ["owner-balance", owner],
    enabled: open && Boolean(owner),
    queryFn: () => ownerAvailableNear(owner!),
    staleTime: 10_000,
  }).data
  const addFunds = useAddFunds(mindId)
  const [amount, setAmount] = useState("1")
  const [copied, setCopied] = useState(false)
  const amountId = useId()
  const sending = addFunds.isPending

  const value = amount.trim()
  const valid = toYocto(value) !== null && compareNear(value, "0") === 1
  const tooMuch = valid && available != null && compareNear(value, available) === 1
  const error = !value ? null : !valid ? "Use a number of NEAR, like 1 or 0.5." : tooMuch ? `Your wallet has ${formatNear(available!)} NEAR. Send less, or get more from the faucet.` : null

  function close(next: boolean) {
    if (!next && sending) return
    onOpenChange(next)
  }

  function submit() {
    if (!valid || tooMuch || sending) return
    addFunds.mutate(
      { address: wallet.address, amountNear: value, balanceBefore: wallet.balanceNear },
      {
        onSuccess: (w) => {
          onOpenChange(false)
          toast.success(`${value} NEAR added. ${name}'s balance is now ${formatNear(w.balanceNear)} NEAR.`)
        },
      }
    )
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked; the address is still shown in full on hover.
    }
  }

  return (
    <Dialog open={open} onOpenChange={close} disablePointerDismissal={sending}>
      <DialogContent showCloseButton={!sending} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add funds to {name}</DialogTitle>
          <DialogDescription>Send testnet NEAR from your wallet. {name} can only spend it inside your limits.</DialogDescription>
        </DialogHeader>

        <form
          id="funds-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <fieldset disabled={sending} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={amountId} className="text-sm font-medium text-foreground">
                Amount
              </label>
              <div
                className={cn(
                  "flex h-11 items-center gap-2 rounded-md border bg-surface px-3.5 transition-[border-color,box-shadow] duration-150 ease-out focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-background",
                  error ? "border-danger" : "border-input"
                )}
              >
                <input
                  id={amountId}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={Boolean(error) || undefined}
                  className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none md:text-[15px]"
                />
                <span className="text-sm font-medium text-muted-foreground">NEAR</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {QUICK.map((q) => (
                  <Button key={q} type="button" size="xs" variant={value === q ? "default" : "outline"} onClick={() => setAmount(q)}>
                    {q} NEAR
                  </Button>
                ))}
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
            </div>

            <dl className="flex flex-col gap-2.5 rounded-md bg-muted px-3.5 py-3 text-[13px]">
              <div className="flex items-start gap-3">
                <dt className="w-10 shrink-0 text-muted-foreground">From</dt>
                <dd className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-foreground">{owner ?? "Your wallet"}</span>
                  <span className="text-xs text-muted-foreground">{available != null ? `${formatNear(available)} NEAR available` : "Checking your balance..."}</span>
                </dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="w-10 shrink-0 text-muted-foreground">To</dt>
                <dd className="flex min-w-0 flex-1 flex-col">
                  <span title={wallet.address} className="truncate font-mono text-foreground">
                    {shortAddress(wallet.address)}
                  </span>
                  <span className="text-xs text-muted-foreground">{name}&apos;s own wallet</span>
                </dd>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={copied ? "Address copied" : "Copy the address"} onClick={() => void copy()}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </Button>
              </div>
            </dl>

            <p className="text-xs text-muted-foreground">
              Need testnet NEAR?{" "}
              <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline">
                Get some free
                <ArrowUpRightIcon className="size-3" />
              </a>
            </p>

            {addFunds.error && (
              <p role="alert" className="text-[13px] text-danger">
                {walletActionText(addFunds.error, "funds")}
              </p>
            )}
          </fieldset>
        </form>

        <DialogFooter>
          <Button variant="outline" disabled={sending} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="funds-form" disabled={sending || !valid || tooMuch}>
            {sending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <SendIcon />}
            {sending ? "Waiting for Meteor" : `Send ${valid ? value : ""} NEAR with Meteor`.replace("  ", " ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
