"use client"

import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { AskPanel } from "@/modules/builder/components/panels/AskPanel"
import { EndingPanel } from "@/modules/builder/components/panels/EndingPanel"
import { EndPanel } from "@/modules/builder/components/panels/EndPanel"
import { HttpPanel } from "@/modules/builder/components/panels/HttpPanel"
import { IfPanel } from "@/modules/builder/components/panels/IfPanel"
import { StartPanel } from "@/modules/builder/components/panels/StartPanel"
import { ToolPanel } from "@/modules/builder/components/panels/ToolPanel"
import type { Kind } from "@/modules/builder/data/blocks"
import { canPlace, carriesOn, ifLockedWhy, isStep, notesBefore, resultsOf, stepsBefore, type Block, type Draft, type IfBlock } from "@/modules/builder/data/draft"
import type { EngineIssue } from "@/modules/builder/data/issues"
import { slotPlace, type Place } from "@/modules/builder/data/places"
import { skillCopy } from "@/modules/skills/data/skills"

type PanelProps = {
  draft: Draft
  picked: Block | null
  /** An If's way, picked through its "Add a step" slot. */
  slot: { block: IfBlock; h: "then" | "else" } | null
  /** The skill a tool comes with, when the Mind doesn't have it yet. */
  missingSkillFor: (tool: string) => string | undefined
  set: (patch: Partial<Draft>) => void
  onPatch: (id: string, patch: Partial<Block>) => void
  onRemove: (id: string) => void
  onAdd: (kind: Kind, at: Place) => void
}

/** The settings of what is picked, then the engine's issues about it and the skills Save adds. */
export function BlockSettings({ issues, missingSkills, ...panel }: PanelProps & { issues: EngineIssue[]; missingSkills: string[] }) {
  const { name } = useBuilder()
  return (
    <>
      <PickedPanel {...panel} />
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md bg-danger-soft p-3 text-xs text-foreground">
          {issues.map((i) => (
            <li key={i.text}>{i.text}</li>
          ))}
        </ul>
      )}
      {missingSkills.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Saving adds {missingSkills.map((s) => skillCopy(s).title).join(" and ")} to {name}: a job can only use its Mind&apos;s skills.
        </p>
      )}
    </>
  )
}

/** A block's own panel, an If's empty way, or else Start. */
function PickedPanel({ draft, picked: b, slot, missingSkillFor, set, onPatch, onRemove, onAdd }: PanelProps) {
  const { self } = useBuilder()
  const line = draft.line
  if (b && isStep(b)) {
    const before = stepsBefore(line, b.id)
    const patch = (p: Partial<Block>) => onPatch(b.id, p)
    const remove = () => onRemove(b.id)
    if (b.kind === "agent") return <AskPanel step={b} results={resultsOf(before, self)} onChange={(prompt) => patch({ prompt })} onDelete={remove} />
    if (b.kind === "http") return <HttpPanel step={b} results={resultsOf(before, self)} missingSkill={missingSkillFor("http_request")} onChange={patch} onDelete={remove} />
    return <ToolPanel step={b} notes={notesBefore(before)} missingSkill={missingSkillFor(b.tool)} onChange={patch} onDelete={remove} />
  }
  if (b?.kind === "if") return <IfPanel branch={b} steps={stepsBefore(line, b.id)} onChange={(p) => onPatch(b.id, p)} onDelete={() => onRemove(b.id)} />
  if (b?.kind === "end") return <EndPanel onDelete={() => onRemove(b.id)} />
  if (slot) {
    const at = slotPlace(line, slot.block, slot.h)
    return (
      <EndingPanel
        which={slot.h}
        more={slot.block[slot.h].length > 0}
        goesOn={carriesOn(line, at.path)}
        canIf={canPlace(line, at.path, at.index, "if", self)}
        ifWhy={ifLockedWhy(line, at.path, at.index, self)}
        canEnd={canPlace(line, at.path, at.index, "end", self)}
        onPick={(kind) => onAdd(kind, at)}
      />
    )
  }
  return <StartPanel draft={draft} set={set} />
}
