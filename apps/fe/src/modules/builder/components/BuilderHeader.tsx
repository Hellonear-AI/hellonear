"use client"

import { ArrowLeftIcon } from "lucide-react"
import type { Ref } from "react"
import { Button } from "@/components/ui/button"
import { SaveButton, TestRunButton } from "@/modules/builder/components/RunButtons"
import { NAME_MAX } from "@/modules/builder/data/draft"

/** The Builder's header: back, the job's name and whether it is saved, then Test run and Save (desktop). */
export function BuilderHeader({
  nameRef,
  name,
  onNameChange,
  dirty,
  saved,
  onBack,
  running,
  testDisabled,
  onTest,
  saving,
  saveDisabled,
  onSave,
}: {
  nameRef: Ref<HTMLInputElement>
  name: string
  onNameChange: (name: string) => void
  dirty: boolean
  /** The job was saved before (it has an id): Test run shows. */
  saved: boolean
  onBack: () => void
  running: boolean
  testDisabled: boolean
  onTest: () => void
  saving: boolean
  saveDisabled: boolean
  onSave: () => void
}) {
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
      <Button variant="ghost" size="icon" aria-label="Back to Autopilot" onClick={onBack}>
        <ArrowLeftIcon />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The job's name, edited right here (n8n does the same); the Start panel shows the same field. */}
        <input
          ref={nameRef}
          aria-label="Job name"
          value={name}
          maxLength={NAME_MAX}
          placeholder="Untitled job"
          onChange={(e) => onNameChange(e.target.value)}
          className="-mx-1.5 w-full max-w-md truncate rounded-sm bg-transparent px-1.5 text-[15px] font-semibold text-foreground outline-none placeholder:text-foreground hover:bg-muted focus:bg-muted focus:placeholder:text-tertiary-foreground"
        />
        <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : !saved ? "Not saved yet" : "All changes saved"}</span>
      </div>
      {saved && (
        <TestRunButton
          className="hidden lg:inline-flex"
          running={running}
          disabled={testDisabled}
          onClick={onTest}
          title={dirty ? "Save your changes to test them" : "Runs the saved job once"}
        />
      )}
      <SaveButton className="hidden lg:inline-flex" saving={saving} disabled={saveDisabled} onClick={onSave} />
    </header>
  )
}
