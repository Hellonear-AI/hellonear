"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { mindHref } from "@/components/layout/nav"
import { isApiCode } from "@/lib/api"
import { autopilotApi } from "@/modules/autopilot/api"
import { autopilotKeys, useWorkflows } from "@/modules/autopilot/hooks/useAutopilot"
import { allBlocks, draftProblems, toCanvas, workflowIdFor, type Draft } from "@/modules/builder/data/draft"
import { engineIssues as engineIssuesOf, type EngineIssue } from "@/modules/builder/data/issues"
import { START } from "@/modules/builder/data/places"
import { useMind } from "@/modules/minds/hooks/useMinds"
import { useSetSkills, useSkillCatalog } from "@/modules/skills/hooks/useSkills"

/**
 * Saving a job: what stops Save, the engine's issues after a refused one, the skills the job needs,
 * and whether there are unsaved changes.
 */
export function useSave({
  mindId,
  workflowId,
  draft,
  initial,
  focusName,
  select,
}: {
  mindId: string
  workflowId: string | null
  draft: Draft
  initial: Draft
  /** Puts the caret in the job's name in the header. */
  focusName: () => void
  /** Picks a block, to show its settings. */
  select: (id: string) => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const mind = useMind(mindId).data
  const catalog = useSkillCatalog().data
  const setSkills = useSetSkills(mindId)
  const jobs = useWorkflows(mindId)
  const [saving, setSaving] = useState(false)
  const [engineIssues, setEngineIssues] = useState<EngineIssue[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedTry, setSavedTry] = useState<string | null>(null)
  // Unfinished blocks turn amber only once Save was pressed; a new empty block isn't a mistake yet.
  const [tried, setTried] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const dirtySinceSave = savedTry !== null && savedTry !== JSON.stringify(draft)
  const problems = draftProblems(draft)

  // What blocks Save, one click away (Ancung, 10 Nov: Save was off and the reason was hidden in a
  // closed panel): the name goes to the name field in the header, anything else picks its block.
  const fix = (where: string) => {
    if (where === "name") {
      focusName()
      return
    }
    if (where === START || where === "steps") select(START)
    else select(where)
  }

  // A job may only use its Mind's tools: the skills it needs and doesn't have are added on Save.
  const usedTools = allBlocks(draft.line).flatMap((s) => (s.kind === "tool" ? [s.tool] : s.kind === "http" ? ["http_request"] : []))
  const missingSkills = [...new Set(usedTools.map((t) => catalog?.find((s) => s.tools.includes(t))?.skillId).filter((s): s is string => Boolean(s)))].filter(
    (s) => mind && !mind.skills.includes(s)
  )

  async function save() {
    // Checked when you press Save, not shown all along (Ancung, 10 Nov: the standing warnings were
    // too much): jump to the first thing missing and say it once.
    if (problems.length > 0) {
      setTried(true)
      fix(problems[0].where)
      toast(problems[0].text)
      return
    }
    setSaving(true)
    setEngineIssues([])
    setSavedTry(JSON.stringify(draft))
    setSaveError(null)
    const id = workflowId ?? workflowIdFor(draft.name, jobs.data?.map((j) => j.workflowId) ?? [])
    try {
      if (missingSkills.length && mind) await setSkills.mutateAsync([...mind.skills, ...missingSkills])
      await autopilotApi.save(mindId, id, toCanvas(draft))
      await queryClient.invalidateQueries({ queryKey: autopilotKeys.list(mindId) })
      await queryClient.invalidateQueries({ queryKey: autopilotKeys.one(mindId, id) })
      router.push(`${mindHref(mindId, "autopilot")}?job=${encodeURIComponent(id)}`)
    } catch (err) {
      setSaving(false)
      if (isApiCode(err, "invalid_workflow")) {
        const issues = (err.details.issues as { path?: string; message?: string }[] | undefined) ?? []
        setEngineIssues(engineIssuesOf(issues, toCanvas(draft).nodes.map((n) => n.id)))
      } else {
        setSaveError("Could not save. No changes were made. Please try again later.")
      }
    }
  }

  return {
    save,
    saving,
    /** Save is on whenever there is something to save. */
    canSave: !saving && (!workflowId || dirty),
    dirty,
    problems,
    saveError,
    engineIssues,
    /** The engine's issues about one block, until the draft changes again. */
    issuesAt: (id: string | null) => engineIssues.filter((i) => i.node === id && !dirtySinceSave),
    // Engine issues pinned to a block mark it too, until the draft changes again.
    flagged: (id: string) => (tried && problems.some((p) => p.where === id)) || (!dirtySinceSave && engineIssues.some((i) => i.node === id)),
    missingSkills,
    /** The skill a tool comes with, when the Mind doesn't have it yet. */
    missingSkillFor: (tool: string) => missingSkills.find((x) => catalog?.find((c) => c.skillId === x)?.tools.includes(tool)),
  }
}
