"use client"

import Image from "next/image"
import { useId, type ReactNode } from "react"
import {
  CheckIcon,
  CircleXIcon,
  HourglassIcon,
  PenLineIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  UserCheckIcon,
  XIcon,
} from "lucide-react"
import { cn } from "cn"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { templateAvatar, templateLabel } from "@/modules/minds/data/minds"
import { MAX_ADDRESSES, MAX_PER_PAYMENT_NEAR, type LimitsCheck } from "@/modules/minds/data/limits"
import type { SetUpStage } from "@/modules/minds/hooks/useSetUpMind"
import { StepHeader } from "@/modules/minds/components/StepHeader"

// L3 Set limits (design/hellonear.pen, "3 · Start"): the per-payment limit and who the Mind may
// pay, a live summary, then "Create {name} and sign". States: suggested limits (L3.1), limit too
// high (L3.2), waiting for Meteor (L3.3), signature canceled (L3.4). The ready moment (L3.5) is
// MindReady. Addresses have no notes: the backend keeps only the list (decided 8 Nov).
export function SetLimitsStep({
  name,
  templateId,
  perPayment,
  onPerPaymentChange,
  rows,
  onRowsChange,
  check,
  stage,
  notice,
  onBack,
  onSubmit,
}: {
  name: string
  templateId: string
  perPayment: string
  onPerPaymentChange: (value: string) => void
  rows: string[]
  onRowsChange: (rows: string[]) => void
  check: LimitsCheck
  stage: SetUpStage
  /** What went wrong last time, shown above the form (L3.4). */
  notice: { text: string; retry: string } | null
  /** Hidden once the Mind exists: going back would create a second one. */
  onBack?: () => void
  onSubmit: () => void
}) {
  const busy = stage !== "idle"
  const perPaymentId = useId()
  const perPaymentHelpId = useId()
  const count = check.whitelist.length

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy && !check.blocker) onSubmit()
        }}
        className="mx-auto flex w-full max-w-[1312px] flex-1 flex-col gap-6 px-4 pt-4 pb-10 md:px-10 md:pt-6 xl:gap-12 xl:px-16"
      >
        <StepHeader step={2} onBack={busy ? undefined : onBack} />

        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-12">
          <fieldset disabled={busy} className="flex min-w-0 flex-1 flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-[30px] leading-tight font-medium tracking-tight text-foreground md:text-4xl xl:text-[40px]">
                Set {name}&apos;s limits
              </h1>
              <p className="text-[15px] text-muted-foreground md:text-base">
                {name} can only spend inside these. You can change them later, and each change needs your signature.
              </p>
            </div>

            {notice && (
              <div role="alert" className="flex items-start gap-2.5 rounded-md bg-danger-soft px-3.5 py-3 text-sm text-foreground">
                <CircleXIcon className="mt-0.5 size-4 shrink-0 text-danger" />
                {notice.text}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={perPaymentId} className="text-sm font-medium text-foreground">
                Per payment
              </label>
              <div
                className={cn(
                  "flex h-[52px] items-center gap-2 rounded-md border bg-surface px-3.5 transition-[border-color,box-shadow] duration-150 ease-out focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-background",
                  check.perPayment ? "border-danger shadow-[0_0_0_0.5px_var(--danger)]" : "border-input"
                )}
              >
                <input
                  id={perPaymentId}
                  value={perPayment}
                  onChange={(e) => onPerPaymentChange(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={Boolean(check.perPayment) || undefined}
                  aria-describedby={perPaymentHelpId}
                  className="min-w-0 flex-1 bg-transparent text-xl font-semibold text-foreground outline-none disabled:opacity-60"
                />
                <span className="text-sm font-medium text-muted-foreground">NEAR</span>
              </div>
              <p id={perPaymentHelpId} aria-live="polite" className={cn("text-xs", check.perPayment ? "text-danger" : "text-tertiary-foreground")}>
                {check.perPayment ?? `Bigger payments are blocked. The most is ${MAX_PER_PAYMENT_NEAR} NEAR.`}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <p id="who-may-pay" className="text-sm font-medium text-foreground">
                Who {name} may pay
              </p>
              <ul aria-labelledby="who-may-pay" className="flex flex-col gap-2">
                {rows.map((row, i) => (
                  <AddressRow
                    key={i}
                    index={i}
                    value={row}
                    error={check.addresses[i]}
                    onChange={(v) => onRowsChange(rows.map((r, j) => (j === i ? v : r)))}
                    onRemove={rows.length > 1 ? () => onRowsChange(rows.filter((_, j) => j !== i)) : undefined}
                  />
                ))}
              </ul>
              {rows.length < MAX_ADDRESSES && (
                <button
                  type="button"
                  onClick={() => onRowsChange([...rows, ""])}
                  className="-mx-0.5 flex w-fit items-center gap-2 rounded-sm px-0.5 py-1.5 text-sm font-semibold text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
                >
                  <PlusIcon className="size-4" />
                  Add an address
                </button>
              )}
              <p className="text-[13px] text-muted-foreground">
                Anyone else is blocked, even if you approve. Add 1 to {MAX_ADDRESSES} addresses.
              </p>
            </div>
          </fieldset>

          <aside className="flex flex-col gap-[18px] rounded-xl border border-border bg-surface p-5 md:p-6 xl:sticky xl:top-6 xl:w-[420px] xl:shrink-0">
            <div className="flex items-center gap-3">
              <span className="relative size-14 shrink-0 overflow-hidden rounded-full bg-muted">
                <Image src={templateAvatar(templateId)} alt="" fill sizes="56px" quality={90} className="object-cover" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-lg font-semibold text-foreground">{name}</span>
                <span className="text-[13px] text-muted-foreground">{templateLabel(templateId)}</span>
              </div>
            </div>

            <ul className="flex flex-col gap-2.5 text-sm text-foreground" aria-live="polite">
              <Rule icon={<CheckIcon className="text-success" />}>Asks you before every payment</Rule>
              <Rule icon={<HourglassIcon className="text-warning" />}>
                {check.perPayment ? (
                  <span className="text-tertiary-foreground">Set a per payment limit</span>
                ) : (
                  `Up to ${perPayment.trim()} NEAR each; bigger is blocked`
                )}
              </Rule>
              <Rule icon={<UserCheckIcon className="text-success" />}>
                {count === 0 ? (
                  <span className="text-tertiary-foreground">Add who {name} may pay</span>
                ) : count === 1 ? (
                  "Only pays the address you added"
                ) : (
                  `Only pays the ${count} addresses you added`
                )}
              </Rule>
              <Rule icon={<XIcon className="text-danger" />}>Can&apos;t change these limits itself</Rule>
            </ul>

            <p className={cn("text-xs", check.blocker ? "text-danger" : "text-tertiary-foreground")}>
              {check.blocker ?? "Meteor will ask you to sign once. It uses a little testnet NEAR."}
            </p>

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
              {onBack && !busy && (
                <Button type="button" variant="secondary" onClick={onBack}>
                  <PencilIcon />
                  Back
                </Button>
              )}
              <Button type="submit" disabled={busy || Boolean(check.blocker)} className="sm:flex-1 xl:flex-none" aria-live="polite">
                {busy ? <Spinner /> : notice ? <RotateCcwIcon /> : <PenLineIcon />}
                {stage === "creating"
                  ? `Creating ${name}`
                  : stage === "signing"
                    ? "Waiting for Meteor"
                    : stage === "checking"
                      ? "Checking the limits"
                      : notice
                        ? notice.retry
                        : `Create ${name} and sign`}
              </Button>
            </div>
          </aside>
        </div>
      </form>
    </div>
  )
}

function Rule({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0">
      {icon}
      <span>{children}</span>
    </li>
  )
}

function AddressRow({
  index,
  value,
  error,
  onChange,
  onRemove,
}: {
  index: number
  value: string
  error: string | null
  onChange: (value: string) => void
  onRemove?: () => void
}) {
  const id = useId()
  const errorId = useId()
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Address {index + 1}
        </label>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="shop.testnet"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? errorId : undefined}
          className="flex-1"
        />
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove address ${index + 1}`}>
            <XIcon />
          </Button>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </li>
  )
}
