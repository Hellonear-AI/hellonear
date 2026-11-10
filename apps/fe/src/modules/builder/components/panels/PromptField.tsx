"use client"

import { PlusIcon } from "lucide-react"
import { useId, useRef, type ReactNode } from "react"
import { cn } from "cn"
import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { PromptEditor, type PromptEditorHandle } from "@/modules/builder/components/PromptText"
import { Field } from "@/modules/builder/components/panels/Field"
import { KIND_META } from "@/modules/builder/data/blocks"
import { promptParts, ref, tokenLabels, type Result } from "@/modules/builder/data/draft"
import { TONE, type Tone } from "@/modules/builder/data/tone"

/** A prompt with its earlier results as chips, and the results it can put in, grouped by step. */
export function PromptField({
  value,
  results,
  onChange,
  labelText,
  placeholder = "Sum up the emails that need me today, in three lines.",
  hint,
}: {
  value: string
  results: Result[]
  onChange: (p: string) => void
  labelText?: string
  placeholder?: string
  /** Replaces the line under the field (an Ask step's says what the Mind can't do alone). */
  hint?: ReactNode
}) {
  const { name } = useBuilder()
  const labels = tokenLabels(results)
  const editor = useRef<PromptEditorHandle>(null)
  const labelId = useId()
  return (
    <Field label={labelText ?? `What should ${name} do?`} labelId={labelId}>
      <PromptEditor ref={editor} value={value} parts={promptParts(value, results)} onChange={onChange} placeholder={placeholder} labelledBy={labelId} />
      {/* Results grouped by the step they come from, so two balances say whose they are (Ancung, 10 Nov). */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
          <span className="text-xs font-medium text-muted-foreground">Put in a result</span>
          {groupBySource(results).map((g) => (
            <div key={g.stepId} className="flex flex-col gap-1.5">
              <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-[6px] [&>svg]:size-3", TONE[g.tone])}>{g.icon}</span>
                <span className="truncate">{g.source}</span>
              </span>
              <span className="flex flex-wrap gap-1.5 pl-7">
                {g.items.map((r) => (
                  <button
                    key={r.name}
                    type="button"
                    // Keep the caret in the field while the chip is clicked.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => editor.current?.insert(ref(r.stepId, r.name), labels.get(`${r.stepId}.${r.name}`) ?? r.label, r.stepKind === "http" ? "http" : "tool")}
                    title={`Puts ${labels.get(`${r.stepId}.${r.name}`)} in the text`}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-xs text-foreground outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <PlusIcon className="size-3 text-muted-foreground" />
                    {r.label.replace(/ \(.*\)$/, "")}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
      {hint ?? <span className="text-xs text-muted-foreground">{name} uses the skills it has. It can&apos;t pay, ask you to approve, or use keys while it runs alone.</span>}
    </Field>
  )
}

/** Results in step order, one group per step, with that step's colour and icon. */
function groupBySource(results: Result[]) {
  const out: { stepId: string; source: string; tone: Tone; icon: ReactNode; items: Result[] }[] = []
  for (const r of results) {
    const g = out.find((x) => x.stepId === r.stepId)
    if (g) g.items.push(r)
    else {
      const { tone, Icon } = KIND_META[r.stepKind === "http" ? "http" : "tool"]
      out.push({ stepId: r.stepId, source: r.source, tone, icon: <Icon />, items: [r] })
    }
  }
  return out
}
