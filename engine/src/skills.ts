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
  skill: ReturnType<typeof createSkill>
}

export function parseSkillMd(text: string, folder: string): SkillEntry {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) throw new Error(`skills/${folder}/SKILL.md: missing YAML frontmatter`)
  const fm = frontmatterSchema.parse(parse(match[1]))
  if (fm.name !== folder) throw new Error(`skills/${folder}/SKILL.md: name "${fm.name}" must match its folder`)
  const unknown = fm.metadata.hellonear.tools.filter((t) => !(t in toolRegistry))
  if (unknown.length) throw new Error(`skills/${folder}/SKILL.md: unknown tools ${unknown.join(', ')}`)
  const instructions = match[2].trim()
  return {
    name: fm.name,
    description: fm.description,
    ...fm.metadata.hellonear,
    skill: createSkill({ name: fm.name, description: fm.description, instructions, metadata: fm.metadata }),
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

// How a skill is shown to the UI: status and connections, so blocked or simulated features are visible, not hidden.
export function skillSummary(id: string) {
  const s = skillCatalog.get(id)
  if (!s) throw new Error(`unknown skill ${id}`)
  return { skillId: id, description: s.description, status: s.status, connections: s.connections, ...(s.note ? { note: s.note } : {}) }
}

// Workflow tools the Mind has not equipped (skills can be unequipped after a workflow is saved).
export function missingTools(skillIds: string[], tools: string[]): string[] {
  const allowed = Object.keys(toolsFor(usableSkills(skillIds).flatMap((s) => s.tools), { unattended: true }))
  return tools.filter((t) => !allowed.includes(t))
}
