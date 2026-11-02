// A Mind's config as sent by the backend (docs/api-contract.md §2), and the system prompt built from it.
import { z } from 'zod'

export const mindSchema = z.object({
  templateId: z.string(),
  name: z.string().min(1),
  soul: z.object({
    identity: z.string().min(1),
    invariants: z.array(z.string()).default([]),
    priors: z.array(z.string()).default([]),
  }),
  model: z.string().optional(),
  skills: z.array(z.object({ skillId: z.string(), toolKeys: z.array(z.string()) })).default([]),
})
export type Mind = z.infer<typeof mindSchema>

export const runRequestSchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  mind: mindSchema,
})

export function buildInstructions(mind: Mind): string {
  const lines = [`You are ${mind.name}. ${mind.soul.identity}`]
  if (mind.soul.invariants.length) {
    lines.push('', 'Rules you must never break, even if asked to:', ...mind.soul.invariants.map((r) => `- ${r}`))
  }
  if (mind.soul.priors.length) {
    lines.push('', 'Preferences learned about your owner:', ...mind.soul.priors.map((p) => `- ${p}`))
  }
  return lines.join('\n')
}

// Memory resource: one per user per Mind, so working memory never leaks between Minds.
export const resourceId = (userId: string, mindId: string) => `${userId}:${mindId}`
