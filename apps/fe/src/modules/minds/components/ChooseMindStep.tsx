"use client"

import Image from "next/image"
import { useId } from "react"
import { CheckIcon, CloudOffIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import type { ApiTemplate } from "@/modules/minds/api"
import { templateImage } from "@/modules/minds/data/minds"
import { NAME_RULE, isValidMindName, skillLabels, sortTemplates } from "@/modules/minds/data/templates"
import { useTemplates } from "@/modules/minds/hooks/useMinds"
import { StepHeader, type StepLeave } from "@/modules/minds/components/StepHeader"

// L2 Choose a Mind (design/hellonear.pen, "3 · Start"): pick a template, name it, Continue.
// Nothing is created here (except for try-out users); the Mind is created in step 2.
// States: nothing picked (L2.1), picked and named (L2.2), name not allowed (L2.3),
// loading (L2.4), could not load (L2.5). Cards on desktop (xl), a list on tablet and phone.
// Desktop screens shorter than the design's 960 px (e.g. a 1920 x 1200 laptop at 150% scaling
// is 1280 x ~680) get a smaller heading and card art, so the cards stay above the bottom bar.
export function ChooseMindStep({
  picked,
  onPick,
  name,
  onNameChange,
  onContinue,
  busy,
  leave,
  tryOut,
}: {
  picked: string | null
  onPick: (templateId: string) => void
  name: string
  onNameChange: (name: string) => void
  onContinue: () => void
  /** Try-out users create the Mind right here (no limits step), so Continue can be busy. */
  busy: boolean
  leave?: StepLeave
  /** A try-out goes straight to the chat: no step count, and the next line says so. */
  tryOut?: boolean
}) {
  const templates = useTemplates()
  const nameId = useId()
  const errorId = useId()

  const list = templates.data ? sortTemplates(templates.data) : null
  const nameInvalid = name.trim() !== "" && !isValidMindName(name)
  const canContinue = picked !== null && isValidMindName(name) && !busy
  const shownName = isValidMindName(name) ? name.trim() : "it"

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="mx-auto flex w-full max-w-[1312px] flex-1 flex-col gap-6 px-4 pt-4 pb-40 md:px-10 md:pt-6 md:pb-32 xl:gap-8 xl:px-16 xl:[@media(max-height:820px)]:gap-6">
        <StepHeader step={1} leave={leave} tryOut={tryOut} />

        <div className="flex flex-col gap-2 xl:items-center xl:text-center">
          <h1 className="text-[30px] leading-tight font-medium tracking-tight text-foreground md:text-4xl xl:text-5xl xl:[@media(max-height:820px)]:text-4xl">
            Choose your first Mind
          </h1>
          <p className="text-[15px] text-muted-foreground md:text-base">
            Pick a starting point. You can change its name, skills and limits later.
          </p>
        </div>

        {templates.isError ? (
          <LoadError onRetry={() => void templates.refetch()} retrying={templates.isFetching} />
        ) : !list ? (
          <TemplatesSkeleton />
        ) : (
          <div role="radiogroup" aria-label="Starting Mind" className="grid gap-3 xl:grid-cols-3 xl:items-start xl:gap-6">
            {list.map((t) => (
              <TemplateCard key={t.templateId} template={t} selected={picked === t.templateId} onPick={() => onPick(t.templateId)} />
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canContinue) onContinue()
        }}
        className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface px-3.5 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:inset-x-10 md:bottom-6 md:rounded-xl md:border md:py-3.5 md:pr-3.5 md:pl-5 xl:inset-x-[max(4rem,calc((100vw-1312px)/2))]"
      >
        <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-4">
          <div className="flex items-center gap-2.5">
            <label htmlFor={nameId} className="shrink-0 text-[13px] font-medium text-muted-foreground">
              Name your Mind
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              disabled={picked === null}
              placeholder={picked === null ? "Pick a Mind first" : "Give it a name"}
              aria-invalid={nameInvalid || undefined}
              aria-describedby={nameInvalid ? errorId : undefined}
              maxLength={24}
              autoComplete="off"
              className="h-10 md:w-60 disabled:bg-surface-muted disabled:opacity-100"
            />
          </div>
          <p
            id={errorId}
            aria-live="polite"
            className={cn(
              "text-[13px] md:ml-auto",
              nameInvalid ? "text-danger" : picked ? "hidden text-muted-foreground md:block" : "hidden text-tertiary-foreground md:block"
            )}
          >
            {nameInvalid ? NAME_RULE : tryOut ? `Next: start chatting with ${shownName}` : `Next: set what ${shownName} may spend`}
          </p>
          <Button type="submit" disabled={!canContinue} className="w-full md:w-auto">
            {busy ? "Creating" : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function TemplateCard({ template, selected, onPick }: { template: ApiTemplate; selected: boolean; onPick: () => void }) {
  const skills = skillLabels(template)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={cn(
        "group flex gap-3.5 overflow-hidden rounded-lg border bg-surface p-3 text-left outline-none transition-[border-color,box-shadow,transform] duration-150 ease-out hover:border-border-strong active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:flex-col xl:gap-0 xl:rounded-xl xl:p-0",
        selected ? "border-primary shadow-[0_0_0_1px_var(--primary)] hover:border-primary" : "border-border"
      )}
    >
      <span className="relative size-20 shrink-0 overflow-hidden rounded-md bg-muted xl:h-[clamp(150px,calc(100dvh-480px),260px)] xl:w-full xl:rounded-none">
        <Image src={templateImage(template.templateId)} alt="" fill sizes="(min-width: 1280px) 421px, 80px" className="object-cover" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1 xl:gap-3 xl:p-5">
        <span className="flex items-center justify-between gap-2">
          <span className="text-base font-semibold text-foreground xl:text-lg">{template.name}</span>
          <span
            aria-hidden="true"
            className={cn(
              "flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,scale] duration-150 ease-out xl:size-6",
              selected ? "scale-100 opacity-100" : "scale-75 opacity-0"
            )}
          >
            <CheckIcon className="size-3.5" strokeWidth={2.5} />
          </span>
        </span>
        <span className="text-sm font-medium text-foreground">&ldquo;{template.quote}&rdquo;</span>
        <span className="text-[13px] text-muted-foreground xl:text-sm">{template.tagline}</span>
        {skills.length > 0 && (
          <span className="flex flex-wrap gap-1.5 pt-0.5">
            {skills.map((s) => (
              <span key={s} className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-muted-foreground xl:text-[13px]">
                {s}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  )
}

function TemplatesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading Minds" className="grid gap-3 xl:grid-cols-3 xl:gap-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3.5 rounded-lg border border-border bg-surface p-3 xl:flex-col xl:gap-0 xl:rounded-xl xl:p-0">
          <Skeleton className="size-20 shrink-0 xl:h-[clamp(150px,calc(100dvh-480px),260px)] xl:w-full xl:rounded-none" />
          <div className="flex flex-1 flex-col gap-2.5 pt-1 xl:p-5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

function LoadError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex min-h-80 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface p-6 text-center xl:min-h-[clamp(320px,calc(100dvh-340px),624px)]">
      <span className="flex size-11 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
        <CloudOffIcon className="size-[22px]" />
      </span>
      <p className="text-base font-semibold text-foreground">Could not load the Minds</p>
      <p className="text-sm text-muted-foreground">Check your connection and try again. Nothing has been created.</p>
      <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
        Try again
      </Button>
    </div>
  )
}
