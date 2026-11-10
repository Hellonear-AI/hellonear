"use client"

import { ChoiceSelect } from "@/components/elements/ChoiceSelect"
import { Input } from "@/components/ui/input"
import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { DeleteBlock } from "@/modules/builder/components/panels/DeleteBlock"
import { Field } from "@/modules/builder/components/panels/Field"
import { PanelHead } from "@/modules/builder/components/panels/PanelHead"
import { PromptField } from "@/modules/builder/components/panels/PromptField"
import { KIND_META } from "@/modules/builder/data/blocks"
import type { HttpStep, Result, Step } from "@/modules/builder/data/draft"
import { useSecrets } from "@/modules/connections/hooks/useKeys"
import { skillCopy } from "@/modules/skills/data/skills"

/** "No key" in the key list (Base UI needs a non-empty value); saved as no header. */
const NO_KEY = "__none__"

export function HttpPanel({
  step,
  results,
  missingSkill,
  onChange,
  onDelete,
}: {
  step: HttpStep
  results: Result[]
  missingSkill?: string
  onChange: (patch: Partial<Step>) => void
  onDelete: () => void
}) {
  const { name } = useBuilder()
  const keys = useSecrets().data ?? []
  const { tone, Icon, title } = KIND_META.http
  return (
    <>
      <PanelHead tone={tone} icon={<Icon />} title={title(name)} />
      <Field label="Do">
        <ChoiceSelect<HttpStep["method"]>
          aria-label="Do"
          value={step.method}
          onChange={(method) => onChange({ method })}
          options={[
            { value: "GET", label: "Read from it (GET)" },
            { value: "POST", label: "Send to it (POST)" },
          ]}
        />
      </Field>
      <Field as="label" label="Address">
        <Input value={step.url} placeholder="https://example.com/status" autoCapitalize="none" spellCheck={false} onChange={(e) => onChange({ url: e.target.value })} />
      </Field>
      <Field
        label="Key"
        hint={
          step.key
            ? "Sent as Authorization: Bearer, only to the sites the key allows. A job with a key runs with Run now, but can't run on a schedule yet."
            : keys.length
              ? "Pick a key saved in Connections if the site needs one."
              : "Keys you save in Connections show up here."
        }
      >
        <ChoiceSelect
          aria-label="Key"
          value={step.key || NO_KEY}
          onChange={(key) => onChange({ key: key === NO_KEY ? "" : key })}
          options={[{ value: NO_KEY, label: "No key" }, ...keys.map((k) => ({ value: k.name, label: k.name }))]}
        />
      </Field>
      {step.method === "POST" && <PromptField value={step.body} results={results} onChange={(body) => onChange({ body })} labelText="What to send" placeholder="Balance is low: please top up." />}
      {missingSkill && <p className="text-xs text-muted-foreground">Websites come with {skillCopy(missingSkill).title}. Saving adds that skill to {name}.</p>}
      <DeleteBlock onClick={onDelete} />
    </>
  )
}
