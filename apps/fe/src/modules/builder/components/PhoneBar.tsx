"use client"

import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SaveButton, TestRunButton } from "@/modules/builder/components/RunButtons"

/**
 * Phones (design B1 mobile): Add a block, always there (Ancung, 10 Nov: with an If the Add card is
 * gone and the + between blocks was easy to miss), then Test run and Save.
 */
export function PhoneBar({
  canAdd,
  onAdd,
  running,
  testDisabled,
  onTest,
  saving,
  saveDisabled,
  onSave,
}: {
  /** The main line's end takes another block. */
  canAdd: boolean
  onAdd: () => void
  running: boolean
  testDisabled: boolean
  onTest: () => void
  saving: boolean
  saveDisabled: boolean
  onSave: () => void
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <Button variant="secondary" disabled={!canAdd} onClick={onAdd}>
        <PlusIcon />
        Add a block
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <TestRunButton running={running} disabled={testDisabled} onClick={onTest} />
        <SaveButton saving={saving} disabled={saveDisabled} onClick={onSave} check />
      </div>
    </div>
  )
}
