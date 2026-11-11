"use client"

import { ChoiceSelect } from "@/components/elements/ChoiceSelect"
import { TimePicker } from "@/components/elements/TimePicker"
import { Input } from "@/components/ui/input"
import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { DeleteBlock } from "@/modules/builder/components/panels/DeleteBlock"
import { Field } from "@/modules/builder/components/panels/Field"
import { PanelHead } from "@/modules/builder/components/panels/PanelHead"
import { PromptField } from "@/modules/builder/components/panels/PromptField"
import { KIND_META } from "@/modules/builder/data/blocks"
import type { Result, Step, ToolStep } from "@/modules/builder/data/draft"
import { toolInfo, TOOLS } from "@/modules/builder/data/tools"
import { skillCopy } from "@/modules/skills/data/skills"
import { builderToolIcon } from "@/modules/builder/components/panels/toolIcon"

export function ToolPanel({
  step,
  notes,
  missingSkill,
  onChange,
  onDelete,
}: {
  step: ToolStep
  /** Notes from earlier Ask steps, the only results "Email me" may send (#146). */
  notes: Result[]
  missingSkill?: string
  onChange: (patch: Partial<Step>) => void
  onDelete: () => void
}) {
  const { name, address } = useBuilder()
  const info = toolInfo(step.tool)
  const setArg = (k: string, v: string) => onChange({ args: { ...step.args, [k]: v } })
  const { tone, Icon, title } = KIND_META.tool
  return (
    <>
      <PanelHead tone={tone} icon={<Icon />} title={title(name)} />
      <Field label="Tool">
        <ChoiceSelect
          aria-label="Tool"
          value={step.tool}
          onChange={(tool) => onChange({ tool, args: tool === "near_view_account" ? { accountId: address } : { ...(toolInfo(tool)?.defaults ?? {}) } })}
          options={TOOLS.map((t) => ({ value: t.tool, label: t.title, icon: builderToolIcon(t.tool) }))}
        />
        {/* Rendered even when empty, so the field keeps its spacing. */}
        <span className="text-xs text-muted-foreground">{info?.line}</span>
      </Field>
      {info?.args.map((a) =>
        a.kind === "account" ? (
          <Field key={a.name} as="label" label={a.label}>
            <Input
              value={step.args[a.name] ?? ""}
              placeholder="shop.testnet"
              className="font-mono"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setArg(a.name, e.target.value.trim().toLowerCase())}
            />
            {address && step.args[a.name] !== address && (
              <button type="button" className="w-fit text-xs font-medium text-foreground underline underline-offset-2" onClick={() => setArg(a.name, address)}>
                Use {name}&apos;s own wallet
              </button>
            )}
          </Field>
        ) : a.kind === "note" ? (
          <div key={a.name} className="flex flex-col gap-2">
            <PromptField
              labelText={a.label}
              placeholder={a.placeholder}
              value={step.args[a.name] ?? ""}
              results={notes}
              onChange={(v) => setArg(a.name, v)}
              hint={<span className="text-xs text-muted-foreground">Sent from {name}&apos;s own address to the Gmail you connected, and nobody else.</span>}
            />
            {!notes.length && <p className="text-xs text-muted-foreground">Add an Ask step before this one: the email sends what {name} wrote, never an email or a web page as it came in.</p>}
          </div>
        ) : a.kind === "time" ? (
          <Field key={a.name} label={a.label} hint={"Today, in the job's time zone."}>
            <TimePicker aria-label={a.label} value={step.args[a.name] || "09:00"} onChange={(v) => setArg(a.name, v)} />
          </Field>
        ) : (
          <Field key={a.name} as="label" label={a.optional ? `${a.label} (optional)` : a.label} hint={a.hint}>
            <Input
              value={step.args[a.name] ?? ""}
              placeholder={a.placeholder}
              inputMode={a.kind === "minutes" ? "numeric" : undefined}
              onChange={(e) => setArg(a.name, a.kind === "minutes" ? e.target.value.replace(/\D/g, "").slice(0, 3) : e.target.value)}
            />
          </Field>
        )
      )}
      {missingSkill && <p className="text-xs text-muted-foreground">This tool comes with {skillCopy(missingSkill).title}. Saving adds that skill to {name}.</p>}
      <DeleteBlock onClick={onDelete} />
    </>
  )
}
