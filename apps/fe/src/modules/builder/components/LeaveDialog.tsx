"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SaveButton } from "@/modules/builder/components/RunButtons"

/** "You have unsaved changes", asked by useLeaveGuard before leaving the Builder. */
export function LeaveDialog({
  open,
  blocked,
  saving,
  onStay,
  onDiscard,
  onSave,
}: {
  open: boolean
  /** Something is missing, so the job can't be saved from here: offer Keep editing instead. */
  blocked: boolean
  saving: boolean
  onStay: () => void
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onStay()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>You have unsaved changes</DialogTitle>
          <DialogDescription>
            {blocked ? "If you leave now, your changes will be lost. The job cannot be saved until the missing details are filled in." : "If you leave now, your changes will be lost."}
          </DialogDescription>
        </DialogHeader>
        {/* Two buttons (Ancung, 10 Nov: three were too many): X, Esc or a click outside keep editing.
            Discard sits apart on the left, the safe choice on the right. */}
        <DialogFooter>
          <Button variant="ghost" className="text-danger sm:mr-auto" onClick={onDiscard}>
            Discard changes
          </Button>
          {blocked ? (
            <Button onClick={onStay}>Keep editing</Button>
          ) : (
            <SaveButton
              saving={saving}
              disabled={saving}
              onClick={() => {
                onStay()
                onSave()
              }}
            />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
