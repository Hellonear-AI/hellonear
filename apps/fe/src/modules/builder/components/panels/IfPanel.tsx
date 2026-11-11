"use client"

import { ChoiceSelect } from "@/components/elements/ChoiceSelect"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { DeleteBlock } from "@/modules/builder/components/panels/DeleteBlock"
import { Field } from "@/modules/builder/components/panels/Field"
import { PanelHead } from "@/modules/builder/components/panels/PanelHead"
import { KIND_META } from "@/modules/builder/data/blocks"
import { OPS } from "@/modules/builder/data/conditions"
import { comparable, INVERT, resultsOf, type IfBlock, type Op, type Step } from "@/modules/builder/data/draft"
import { builderToolIcon } from "@/modules/builder/components/panels/toolIcon"

export function IfPanel({ branch, steps, onChange, onDelete }: { branch: IfBlock; steps: Step[]; onChange: (p: Partial<IfBlock>) => void; onDelete: () => void }) {
  const { name, self } = useBuilder()
  const results = resultsOf(steps, self).filter(comparable)
  const current = results.find((r) => r.stepId === branch.stepId && r.name === branch.field)
  const ops = OPS.filter((o) => current?.kind === "number" || !o.number)
  const { tone, Icon, title } = KIND_META.if
  return (
    <>
      <PanelHead tone={tone} icon={<Icon />} title={title(name)} />
      <Field label="Look at" hint="Pick a result from an earlier block.">
        <ChoiceSelect
          aria-label="Look at"
          value={current ? `${current.stepId}|${current.name}` : ""}
          placeholder="Pick a result"
          onChange={(v) => {
            const [stepId, f] = v.split("|")
            const r = results.find((x) => x.stepId === stepId && x.name === f)
            onChange({ stepId, field: f, op: r?.kind === "number" ? "lt" : "eq", right: "" })
          }}
          // Each result carries its step's icon, so it's clear where a value comes from (Ancung, 11 Nov).
          options={results.map((r) => ({ value: `${r.stepId}|${r.name}`, label: r.label, hint: r.source, icon: resultIcon(steps.find((x) => x.id === r.stepId)) }))}
        />
      </Field>
      <Field label="Is">
        <ChoiceSelect<Op> aria-label="Is" value={branch.op} onChange={(op) => onChange({ op })} options={ops.map((o) => ({ value: o.op, label: o.label }))} />
      </Field>
      <Field as="label" label={current?.kind === "number" ? "This number" : "This text"}>
        <Input
          value={branch.right}
          inputMode={current?.kind === "number" ? "decimal" : "text"}
          placeholder={current?.kind === "number" ? "5" : current?.name === "weekday" ? "Friday" : ""}
          onChange={(e) => onChange({ right: e.target.value })}
        />
      </Field>
      <p className="text-xs text-muted-foreground">Then pick what happens for yes and for no on the canvas. A way left empty stops the job there.</p>
      <Button variant="outline" className="w-fit" onClick={() => onChange({ op: INVERT[branch.op], then: branch.else, else: branch.then })}>
        Swap Yes and No
      </Button>
      <DeleteBlock onClick={onDelete} />
    </>
  )
}

/** A tool step's own icon (an app's logo), else its block kind's (a website, the Mind). */
function resultIcon(step: Step | undefined) {
  if (!step) return null
  if (step.kind === "tool") return builderToolIcon(step.tool)
  const { Icon } = KIND_META[step.kind]
  return <Icon />
}
