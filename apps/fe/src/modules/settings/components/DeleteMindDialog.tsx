"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { TriangleAlertIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { isApiCode } from "@/lib/api"
import { formatNear } from "@/lib/format"
import { mindKeys } from "@/lib/queryKeys"
import { rememberLeftMinds } from "@/modules/auth/data/leftMinds"
import { mindsApi } from "@/modules/minds/api"
import type { ApiWallet } from "@/modules/wallet/api"

/**
 * Delete a Mind (M1.4): `DELETE /minds/{id}`, then the Mind is remembered as left (so Back doesn't
 * 404) and the app goes to `/`. With NEAR still in its wallet the backend answers
 * `409 wallet_not_empty` (#163), and the dialog asks again with the amount.
 */
function useDeleteMind(mindId: string, name: string, onStuck: (balanceNear: string) => void) {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (acknowledgeBalance: boolean) => mindsApi.remove(mindId, acknowledgeBalance),
    onSuccess: async () => {
      // Back to this Mind's pages should land on the newest Mind, not a 404 (MindGate).
      rememberLeftMinds([mindId])
      toast.success(`${name} was deleted`)
      await queryClient.invalidateQueries({ queryKey: mindKeys.all })
      router.replace("/")
    },
    onError: (err) => {
      // Money left in its wallet: ask again, plainly, with the amount (Axel on #161).
      if (isApiCode(err, "wallet_not_empty")) {
        onStuck(String(err.details.balanceNear ?? ""))
        return
      }
      toast.error(`Could not delete ${name}`, {
        description: isApiCode(err, "demo_not_allowed")
          ? "A try-out Mind can't be deleted."
          : isApiCode(err, "outlayer_unreachable", "outlayer_error")
            ? "Its wallet could not be checked. No changes were made. Please try again later."
            : "Please try again later.",
      })
    },
  })
}

export function DeleteMindDialog({
  mindId,
  name,
  wallet,
  tryOut,
  open,
  onOpenChange,
}: {
  mindId: string
  name: string
  wallet: ApiWallet | null | undefined
  tryOut: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // The NEAR the backend says is still in the Mind's wallet (409 wallet_not_empty, #163).
  const [stuck, setStuck] = useState<string | null>(null)
  const remove = useDeleteMind(mindId, name, setStuck)
  const close = () => {
    onOpenChange(false)
    setStuck(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return
        if (next) onOpenChange(true)
        else close()
      }}
    >
      <DialogContent>
        {stuck !== null ? (
          // #163: the backend found NEAR in the wallet. Deleting removes the wallet's only key.
          <>
            <DialogHeader>
              <DialogTitle>
                {name}&apos;s wallet still holds {stuck ? `${formatNear(stuck)} NEAR` : "NEAR"}
              </DialogTitle>
              <DialogDescription>
                Deleting {name} also deletes the only key to its wallet. After that nobody can move this NEAR, not you and not HelloNear. To keep it, have {name} pay it to one of your addresses first.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={remove.isPending}>
                Keep {name}
              </Button>
              <Button variant="destructive" onClick={() => remove.mutate(true)} disabled={remove.isPending}>
                {remove.isPending && <Spinner />}
                Delete and lose it
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Delete {name}?</DialogTitle>
              <DialogDescription>
                {name}, its chats, memory and Autopilot jobs are removed. This can&apos;t be undone.
              </DialogDescription>
            </DialogHeader>
            <ul className="flex flex-col gap-2 rounded-md bg-muted p-3 text-[13px] text-foreground">
              {/* A try-out pays from the shared test wallet, so there is nothing of its own to lose (#163). */}
              {!tryOut && !wallet?.shared && (
                <li className="flex gap-2">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                  {wallet?.balanceNear && Number(wallet.balanceNear) > 0.001
                    ? `The ${formatNear(wallet.balanceNear)} NEAR in its wallet can't be moved by anyone once ${name} is deleted.`
                    : `If its wallet holds NEAR, nobody can move it once ${name} is deleted. You'll be asked first.`}
                </li>
              )}
              <li className="flex gap-2">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                Past payments stay visible on NearBlocks.
              </li>
              <li className="flex gap-2">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                {name} can&apos;t be brought back.
              </li>
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={remove.isPending}>
                Keep {name}
              </Button>
              <Button variant="destructive" onClick={() => remove.mutate(false)} disabled={remove.isPending}>
                {remove.isPending && <Spinner />}
                Delete {name}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
