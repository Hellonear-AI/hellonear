"use client"

import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { DeleteBlock } from "@/modules/builder/components/panels/DeleteBlock"
import { PanelHead } from "@/modules/builder/components/panels/PanelHead"
import { PromptField } from "@/modules/builder/components/panels/PromptField"
import { KIND_META } from "@/modules/builder/data/blocks"
import type { AskStep, Result } from "@/modules/builder/data/draft"

export function AskPanel({ step, results, onChange, onDelete }: { step: AskStep; results: Result[]; onChange: (p: string) => void; onDelete: () => void }) {
  const { name } = useBuilder()
  const { tone, Icon, title } = KIND_META.agent
  return (
    <>
      <PanelHead tone={tone} icon={<Icon />} title={title(name)} />
      <PromptField value={step.prompt} results={results} onChange={onChange} />
      <DeleteBlock onClick={onDelete} />
    </>
  )
}
