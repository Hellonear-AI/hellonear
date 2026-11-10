"use client"

import { ChoiceSelect } from "@/components/elements/ChoiceSelect"
import { TimePicker } from "@/components/elements/TimePicker"
import { Input } from "@/components/ui/input"
import { zoneName } from "@/modules/autopilot/data/schedule"
import { Field } from "@/modules/builder/components/panels/Field"
import { PanelHead } from "@/modules/builder/components/panels/PanelHead"
import { KIND_META } from "@/modules/builder/data/blocks"
import { NAME_MAX, type Draft, type Repeat } from "@/modules/builder/data/draft"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export function StartPanel({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const { Icon } = KIND_META.start
  return (
    <>
      <PanelHead icon={<Icon />} title="Start" />
      <Field as="label" label="Name">
        <Input value={draft.name} maxLength={NAME_MAX} placeholder="Morning inbox summary" onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Runs">
        <ChoiceSelect<Repeat>
          aria-label="Runs"
          value={draft.repeat}
          onChange={(repeat) => set({ repeat })}
          options={[
            { value: "daily", label: "Every day" },
            { value: "weekdays", label: "Weekdays" },
            { value: "weekly", label: "Once a week" },
          ]}
        />
      </Field>
      {draft.repeat === "weekly" && (
        <Field label="On">
          <ChoiceSelect aria-label="On" value={String(draft.day)} onChange={(d) => set({ day: Number(d) })} options={DAYS.map((d, i) => ({ value: String(i), label: d }))} />
        </Field>
      )}
      <Field label="At">
        <TimePicker aria-label="At" value={draft.time} onChange={(time) => set({ time })} />
      </Field>
      <Field label="Time zone">
        <span className="text-sm text-muted-foreground">{zoneName(draft.timezone)}, from this device</span>
      </Field>
      <p className="text-xs text-muted-foreground">Autopilot runs it at this time once you turn it on.</p>
    </>
  )
}
