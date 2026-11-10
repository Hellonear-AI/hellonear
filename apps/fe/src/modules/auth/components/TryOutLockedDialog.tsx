"use client"

import { LockIcon, Loader2Icon, WalletMinimalIcon, CircleXIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { walletError } from "@/modules/auth/components/SignInScreen"
import { useSwitchToWallet } from "@/modules/auth/hooks/useSession"

/** Owner actions a try-out can't do (the backend answers them with 403 `demo_not_allowed`). */
export type LockedAction = "add-funds" | "freeze" | "limits" | "wallet" | "keys" | "autopilot"

/** Why this action needs a wallet, in one or two sentences (T1.4). */
export function lockedReason(action: LockedAction, name: string): string {
  switch (action) {
    case "freeze":
      return `Freezing needs the owner's signature. In try-out, ${name} uses a shared test wallet that only HelloNear can change.`
    case "add-funds":
      return `Funds come from your own wallet. In try-out, ${name} uses a shared test wallet that HelloNear fills.`
    case "limits":
      return `Changing limits needs the owner's signature. In try-out, ${name} uses a shared test wallet with limits HelloNear sets.`
    case "wallet":
      return `A wallet of ${name}'s own needs your signature for its limits. In try-out, ${name} pays from a shared test wallet.`
    case "keys":
      return "Keys are kept for your account, and a try-out can't keep them. Connect a wallet to save keys for your own services."
    case "autopilot":
      return `Jobs that run on a schedule need your own account. In try-out, you can still run ${name}'s jobs by hand with Run now.`
  }
}

/**
 * T1.4: an owner action in a try-out. Says why it needs a wallet and offers Meteor straight away;
 * signing in replaces the try-out session, and nothing from the try-out carries over.
 * A centered dialog from `sm`, a sheet from the bottom on phones (as in the design).
 */
export function TryOutLockedDialog({ action, name, onClose }: { action: LockedAction | null; name: string; onClose: () => void }) {
  // Keep the last action while the dialog animates out.
  const [shown, setShown] = useState<LockedAction | null>(action)
  if (action && action !== shown) setShown(action)
  const connect = useSwitchToWallet()

  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open && !connect.isPending) {
          connect.reset()
          onClose()
        }
      }}
    >
      <DialogContent className="max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:p-6 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:data-open:zoom-in-100 max-sm:data-open:slide-in-from-bottom-8 max-sm:data-closed:zoom-out-100">
        <div className="flex items-start gap-4 pr-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-strong">
            <LockIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle className="text-xl font-semibold text-foreground">Connect a wallet to do this</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{shown ? lockedReason(shown, name) : null}</DialogDescription>
          </div>
        </div>

        {connect.error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-md bg-danger-soft px-3.5 py-3 text-sm text-foreground">
            <CircleXIcon className="mt-0.5 size-4 shrink-0 text-danger" />
            {walletError(connect.error)}
          </div>
        )}

        <p className="text-[13px] text-tertiary-foreground">Connecting keeps nothing from this try-out. You start fresh with your own Mind and limits.</p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            disabled={connect.isPending}
            onClick={() => {
              connect.reset()
              onClose()
            }}
          >
            Not now
          </Button>
          <Button disabled={connect.isPending} onClick={() => connect.start()}>
            {connect.isPending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <WalletMinimalIcon />}
            {connect.isPending ? "Waiting for Meteor" : "Connect Meteor"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** One dialog per screen: `lock("freeze")` opens it for that action. */
export function useTryOutLock() {
  const [action, setAction] = useState<LockedAction | null>(null)
  return { action, lock: setAction, close: () => setAction(null) }
}
