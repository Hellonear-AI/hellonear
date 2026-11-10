"use client"

import { CheckIcon, FlaskConicalIcon } from "lucide-react"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"

/** Test run, in the desktop header and the phone bar: a spinner and "Testing" while it runs. */
export function TestRunButton({ running, disabled, onClick, className, title }: { running: boolean; disabled: boolean; onClick: () => void; className?: string; title?: string }) {
  return (
    <Button variant="outline" className={className} onClick={onClick} disabled={disabled} title={title}>
      {running ? <Spinner /> : <FlaskConicalIcon />}
      {running ? "Testing" : "Test run"}
    </Button>
  )
}

/** Save, in the header, the phone bar and the leave dialog: a spinner while it saves. */
export function SaveButton({
  saving,
  disabled,
  onClick,
  className,
  check = false,
}: {
  saving: boolean
  disabled: boolean
  onClick: () => void
  className?: string
  /** A check mark when not saving (the phone bar's). */
  check?: boolean
}) {
  return (
    <Button className={className} onClick={onClick} disabled={disabled}>
      {saving ? <Spinner /> : check && <CheckIcon />}
      Save
    </Button>
  )
}
