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
  // Bumped by the backend when the name or soul changes (#116); memory is keyed on it so an old persona is not recalled.
  personaVersion: z.number().int().min(0).optional(),
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

// A plain "halo" once made a Payments Mind load Daily planner, check the time, read the calendar and update its memory
// before greeting: 4 steps, 37 s (#205). Mastra's own prompt says to activate a matching skill "immediately" and to
// update working memory "proactively", so a greeting needs an explicit "no tools".
export const SMALL_TALK_RULE =
  'Greetings, thanks and small talk ("hi", "thanks", "how are you?") get one or two short, friendly lines and no tool calls: do not load a skill, check the time, read the calendar or inbox, or update your memory for them. Do not bring up the date, the time or the schedule unasked. Call a tool only when the message asks for something that tool does (the time, the calendar, a plan for the day, a payment), or when the owner tells you something new about themselves to remember.'

// Indonesian replies had typos and words that are not Indonesian (#205). The rule names no language: naming Indonesian
// and KBBI (first version) made English chats get Indonesian replies (11 Nov).
export const LANGUAGE_RULE =
  'Language: write your reply in the same language as the owner\'s latest message, whatever language your earlier replies, your memory or your instructions use. Use correct, standard spelling and grammar for that language and only real words; never mix in words from another language and never invent words. Never correct yourself in the middle of a reply: if you are not sure of a name, place or fact, leave it out. Keep sentences short and simple.'

// The Mind knows its own skills and the ones the owner could add (#114), by the names on the Skills screen, so it
// can say "add Email helper in Skills" instead of only saying no.
export function skillsLine(skillIds: string[]): string {
  // "Email helper (reads Gmail and saves drafts, never sends)": with what each can do, the Mind names the right one.
  const named = (id: string) => { const s = skillCatalog.get(id); return s ? `${s.title ?? id}${s.blurb ? ` (${s.blurb})` : ''}` : id }
  const mine = skillIds.filter((id) => skillCatalog.has(id) && !skillCatalog.get(id)!.builtin).map(named)
  const more = equippableSkills().filter((s) => s.status !== 'blocked' && !skillIds.includes(s.name)).map((s) => named(s.name))
  return [
    `Your skills, what you can do right now: ${mine.length ? mine.join('; ') : 'none yet'}.`,
    more.length ? `Not yours yet; the owner can add them on the Skills screen: ${more.join('; ')}.` : '',
    // Asked "what can you do?", the Mind listed Payments and Gmail as its own in 7 of 10 replies (10 Nov).
    'When the owner asks what you can do, describe only your own skills. Never present a skill you do not have as something you can do; at most, end with one short line naming a few the owner could add on the Skills screen.',
    'If the owner asks for something none of your skills can do, say so plainly and name the skill that would do it, if one exists.',
  ].filter(Boolean).join(' ')
}

// The rule above is backed by plainDashes on the reply text (src/events.ts): both dashes become a plain hyphen, which
// keeps the spacing around them. Applied per streamed delta: each dash is one character, never split across deltas.
export const plainDashes = (t: string) => t.replace(/[—–]/g, '-')

// The owner's zone (#124): without it the model once booked "tomorrow 2pm" at 14:00 UTC, 21:00 in Jakarta.
export function timeZoneLine(timeZone: string, now = new Date()): string {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const utc = offset === 'GMT' ? 'UTC+00:00' : offset.replace('GMT', 'UTC')
  return `The owner's time zone is ${timeZone} (${utc} now). Call get_time before using a relative day (today, tomorrow, Friday), and give every time you pass to a tool with the owner's offset.`
}

export function buildInstructions(mind: Mind, opts: { timeZone?: string } = {}): string {
  const lines = [`You are ${mind.name}. ${mind.soul.identity}`, '', WRITING_STYLE_RULE, '', LANGUAGE_RULE, '', SMALL_TALK_RULE, '', skillsLine(mind.skills.map((s) => s.skillId))]
  if (opts.timeZone) lines.push('', timeZoneLine(opts.timeZone))
  if (mind.soul.invariants.length) {
    lines.push('', 'Rules you must never break, even if asked to:', ...mind.soul.invariants.map((r) => `- ${r}`))
  }
  if (mind.soul.priors.length) {
    lines.push('', 'Preferences learned about your owner:', ...mind.soul.priors.map((p) => `- ${p}`))
  }
  return lines.join('\n')
}

// Memory resource: one per user per Mind (so working memory never leaks between Minds), and per persona version once the owner renamed it or changed its soul
// (#116): a renamed Mind once signed with its old name, recalled from the old memory. Version 0 / absent keeps the
// original key, so Minds that never changed keep their memory.
export const resourceId = (userId: string, mindId: string, personaVersion?: number) =>
  personaVersion ? `${userId}:${mindId}:v${personaVersion}` : `${userId}:${mindId}`

// True when a memory resource is this user's memory of this Mind, under any persona version (#207: deleting a chat
// only touches threads of the caller's own Mind).
export function ownsResource(resource: string | undefined, userId: string, mindId: string): boolean {
  const base = resourceId(userId, mindId)
  if (!resource) return false
  return resource === base || (resource.startsWith(`${base}:v`) && /^\d+$/.test(resource.slice(base.length + 2)))
}
