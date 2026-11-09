// Skill catalog loaded from engine/skills/<name>/SKILL.md (Agent Skills format).
// The engine, not the backend, decides which tools a skill grants.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSkill } from '@mastra/core/skills'
import { parse } from 'yaml'
import { z } from 'zod'
import { toolRegistry, toolsFor } from './tools.ts'

const frontmatterSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().min(1),
  metadata: z.object({
    hellonear: z.object({
      tools: z.array(z.string()),
      connections: z.array(z.string()),
      status: z.enum(['available', 'simulated', 'blocked']),
      note: z.string().optional(),
      // The name people see (the FE's Skills screen), so a Mind can name a skill to add (#114).
      title: z.string().optional(),
      // One line on what it can and cannot do, for the Mind's own list of skills (#114).
      blurb: z.string().optional(),
      // Built in: every Mind has it, it is not offered in GET /v1/skills and cannot be equipped or removed (#114).
      builtin: z.boolean().optional(),
      // Shared docs from engine/references/ the Mind can open with skill_read when it needs them,
      // so several skills reuse one verified text without loading it into every prompt.
      references: z.array(z.string().regex(/^[a-z0-9-]+\.md$/)).optional(),
    }),
  }),
})

export type SkillEntry = {
  name: string
  description: string
  tools: string[]
  connections: string[]
  status: 'available' | 'simulated' | 'blocked'
  note?: string
  title?: string
  blurb?: string
  builtin?: boolean
  references?: string[]
  skill: ReturnType<typeof createSkill>
}

const referencesDir = new URL('../references', import.meta.url).pathname

export function parseSkillMd(text: string, folder: string, readReference = (file: string) => readFileSync(join(referencesDir, file), 'utf8')): SkillEntry {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) throw new Error(`skills/${folder}/SKILL.md: missing YAML frontmatter`)
  const fm = frontmatterSchema.parse(parse(match[1]))
  if (fm.name !== folder) throw new Error(`skills/${folder}/SKILL.md: name "${fm.name}" must match its folder`)
  const unknown = fm.metadata.hellonear.tools.filter((t) => !(t in toolRegistry))
  if (unknown.length) throw new Error(`skills/${folder}/SKILL.md: unknown tools ${unknown.join(', ')}`)
  const instructions = match[2].trim()
  const references = Object.fromEntries((fm.metadata.hellonear.references ?? []).map((file) => [file, readReference(file)]))
  return {
    name: fm.name,
    description: fm.description,
    ...fm.metadata.hellonear,
    skill: createSkill({ name: fm.name, description: fm.description, instructions, references, metadata: fm.metadata }),
  }
}

export function loadSkillCatalog(dir: string): Map<string, SkillEntry> {
  const catalog = new Map<string, SkillEntry>()
  for (const folder of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    catalog.set(folder, parseSkillMd(readFileSync(join(dir, folder, 'SKILL.md'), 'utf8'), folder))
  }
  return catalog
}

export const skillCatalog = loadSkillCatalog(new URL('../skills', import.meta.url).pathname)

// Skills a Mind may actually use: blocked skills are never loaded.
export function usableSkills(skillIds: string[]): SkillEntry[] {
  return skillIds.map((id) => skillCatalog.get(id)).filter((s): s is SkillEntry => !!s && s.status !== 'blocked')
}

// Built-in skills (the HelloNear guide) are loaded for every Mind on top of its equipped skills.
export const builtinSkillIds = () => [...skillCatalog.values()].filter((s) => s.builtin && s.status !== 'blocked').map((s) => s.name)
export const mindSkills = (skillIds: string[]) => usableSkills([...new Set([...skillIds, ...builtinSkillIds()])])
// Skills an owner can equip: the catalog without built-ins.
export const equippableSkills = () => [...skillCatalog.values()].filter((s) => !s.builtin)

// How a skill is shown to the UI: status and connections, so blocked or simulated features are visible, not hidden.
export function skillSummary(id: string) {
  const s = skillCatalog.get(id)
  if (!s) throw new Error(`unknown skill ${id}`)
  return { skillId: id, description: s.description, status: s.status, connections: s.connections, ...(s.note ? { note: s.note } : {}) }
}

// Every skill a Mind may equip, not only those a template starts with (e.g. the Visual Builder's
// near-account and http-request). Blocked skills are listed so the UI can say why they are off.
export const skillCatalogSummaries = () => equippableSkills().map((s) => ({ ...skillSummary(s.name), tools: s.tools }))

// Workflow tools the Mind has not equipped (skills can be unequipped after a workflow is saved).
export function missingTools(skillIds: string[], tools: string[]): string[] {
  const allowed = Object.keys(toolsFor(usableSkills(skillIds).flatMap((s) => s.tools), { unattended: true }))
  return tools.filter((t) => !allowed.includes(t))
}
