// A Mind's config as sent by the backend (docs/api-contract.md §2), and the system prompt built from it.
import { z } from 'zod'
import { secretSchema } from './secrets.ts'
import { walletTokenSchema } from './wallet.ts'
import { mailTokenSchema } from './mail.ts'
import { equippableSkills, skillCatalog } from './skills.ts'

export const timeZoneSchema = z.string().max(64).refine((tz) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}, { message: 'unknown time zone' })

export const mindSchema = z.object({
  templateId: z.string(),
  name: z.string().min(1),
  soul: z.object({
    identity: z.string().min(1),
    invariants: z.array(z.string()).default([]),
    priors: z.array(z.string()).default([]),
  }),
  model: z.string().optional(),
  // Equipped skills by id. The engine's catalog decides which tools each skill grants.
  skills: z.array(z.object({ skillId: z.string().refine((id) => skillCatalog.has(id), { message: 'unknown skillId' }) })).default([]),
})
export type Mind = z.infer<typeof mindSchema>

export const runRequestSchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  mind: mindSchema,
  // The owner's secrets for this run (#18). Values reach tools only, never the model or events.
  secrets: z.array(secretSchema).default([]),
  // Run-scoped token for the payment tools, only when the Mind has a wallet (#42). Never the wallet key.
  walletToken: walletTokenSchema.optional(),
  // Run-scoped token for the mail tools, only when the Mind has an email address (#96). Never the AgentMail key.
  mailToken: mailTokenSchema.optional(),
  // A judge try-out user (#43): email tools read the sample inbox, never Gmail.
  demo: z.boolean().optional(),
  // The owner's IANA time zone (#112), already validated by the backend; checked again here. Absent: UTC.
  timeZone: timeZoneSchema.optional(),
})

// House style for every Mind (Axel, 9 Nov): replies read as plain human writing, without the em dashes models
// overuse. Dashes in ranges become "to" or a plain hyphen.
export const WRITING_STYLE_RULE =
  'Writing style: never use the em dash (—) or the en dash (–). Use a comma, a colon, a full stop or parentheses instead, and write ranges with "to" or a plain hyphen (09:00-10:00, Monday to Friday).'

// The Mind knows its own skills and the ones the owner could add (#114), by the names on the Skills screen, so it
// can say "add Email helper in Skills" instead of only saying no.
export function skillsLine(skillIds: string[]): string {
  // "Email helper (reads Gmail and saves drafts, never sends)": with what each can do, the Mind names the right one.
  const named = (id: string) => { const s = skillCatalog.get(id); return s ? `${s.title ?? id}${s.blurb ? ` (${s.blurb})` : ''}` : id }
  const mine = skillIds.filter((id) => skillCatalog.has(id) && !skillCatalog.get(id)!.builtin).map(named)
  const more = equippableSkills().filter((s) => s.status !== 'blocked' && !skillIds.includes(s.name)).map((s) => named(s.name))
  return [
    `Your skills: ${mine.length ? mine.join('; ') : 'none yet'}.`,
    more.length ? `Skills the owner can add on the Skills screen: ${more.join('; ')}.` : '',
    'If the owner asks for something none of your skills can do, say so plainly and name the skill that would do it, if one exists.',
  ].filter(Boolean).join(' ')
}

export function buildInstructions(mind: Mind): string {
  const lines = [`You are ${mind.name}. ${mind.soul.identity}`, '', WRITING_STYLE_RULE, '', skillsLine(mind.skills.map((s) => s.skillId))]
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
