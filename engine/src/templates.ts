// Mind templates from engine/templates/*.json, validated against the skill catalog.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { skillCatalog } from './skills.ts'

const templateSchema = z.object({
  templateId: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  tagline: z.string().min(1),
  soul: z.object({ identity: z.string().min(1), invariants: z.array(z.string()), priors: z.array(z.string()) }),
  model: z.string().min(1),
  skills: z.array(z.string()).min(1),
})
export type Template = z.infer<typeof templateSchema>

export function loadTemplates(dir: string): Template[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      const t = templateSchema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8')))
      if (`${t.templateId}.json` !== file) throw new Error(`templates/${file}: templateId must match the file name`)
      const missing = t.skills.filter((s) => !skillCatalog.has(s))
      if (missing.length) throw new Error(`templates/${file}: unknown skills ${missing.join(', ')}`)
      return t
    })
}

export const templates = loadTemplates(new URL('../templates', import.meta.url).pathname)

// What the frontend's "Choose a Mind" screen shows: each skill with its status and the
// connections (apps) it needs, so blocked or simulated features are visible, not hidden.
export function templateSummaries() {
  return templates.map((t) => ({
    ...t,
    skills: t.skills.map((id) => {
      const s = skillCatalog.get(id)!
      return { skillId: id, description: s.description, status: s.status, connections: s.connections, ...(s.note ? { note: s.note } : {}) }
    }),
  }))
}
