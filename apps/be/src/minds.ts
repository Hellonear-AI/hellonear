// Minds (#8, #13): created from an engine template, owned by one user, customised by the owner.
import { z } from 'zod'
import { newId } from './crypto.ts'
import { pool, query } from './db.ts'
import { skills, templates, type MindConfig } from './engine.ts'
import { HttpError } from './http.ts'
import { shownEmail } from './mail.ts'

const soulSchema = z.object({
  identity: z.string().min(1).max(4000),
  invariants: z.array(z.string().min(1).max(500)).max(20).default([]),
  priors: z.array(z.string().min(1).max(500)).max(50).default([]),
})
const skillsSchema = z.array(z.string().min(1).max(64)).max(16)

export const createMindSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().trim().min(1).max(64),
  soul: soulSchema.optional(),
  model: z.string().min(1).max(128).optional(),
  skills: skillsSchema.optional(),
})
export const updateMindSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  soul: soulSchema.optional(),
  model: z.string().min(1).max(128).optional(),
  skills: skillsSchema.optional(),
})

export type Mind = {
  id: string
  templateId: string
  name: string
  soul: MindConfig['soul']
  model: string | null
  skills: string[]
  outlayerWalletId: string | null
  // The Mind's email address (#96): its own AgentMail inbox, or the shared demo inbox for a try-out user's Mind that
  // equips `email-address`. null until then.
  email: string | null
  // Bumped when the name or soul changes (#116); the engine keys memory on it. 0 = never changed.
  personaVersion: number
  createdAt: string
  updatedAt: string
}

const SELECT = `select m.id, m.template_id, m.name, m.soul, m.model, m.outlayer_wallet_id, m.persona_version, m.created_at, m.updated_at,
  coalesce((select array_agg(ms.skill_id order by ms.position) from mind_skills ms where ms.mind_id = m.id), '{}') as skills,
  (select mi.email from mind_inboxes mi where mi.mind_id = m.id) as email,
  (select u.is_demo from users u where u.id = m.user_id) as is_demo
  from minds m`

const toMind = (r: any): Mind => ({
  id: r.id, templateId: r.template_id, name: r.name, soul: r.soul, model: r.model, skills: r.skills,
  outlayerWalletId: r.outlayer_wallet_id, email: shownEmail(r.is_demo === true, r.skills, r.email ?? null), personaVersion: r.persona_version, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
})

// The config the engine builds the agent from on every request (docs/api-contract.md §2).
export const mindConfig = (m: Mind): MindConfig => ({
  templateId: m.templateId, name: m.name, soul: m.soul, ...(m.model ? { model: m.model } : {}), skills: m.skills.map((skillId) => ({ skillId })),
  // Sent only after a change, so a Mind that was never renamed keeps its memory (#116).
  ...(m.personaVersion > 0 ? { personaVersion: m.personaVersion } : {}),
})

// Skills a Mind may equip: the engine's whole catalog (docs/api-contract.md §2 `GET /v1/skills`).
async function knownSkills(): Promise<Set<string>> {
  return new Set((await skills()).map((s) => s.skillId))
}

async function assertSkills(skills: string[]) {
  const known = await knownSkills()
  const unknown = skills.filter((s) => !known.has(s))
  if (unknown.length) throw new HttpError(400, 'unknown_skill', { skills: unknown })
  if (new Set(skills).size !== skills.length) throw new HttpError(400, 'duplicate_skill')
}

async function writeSkills(client: { query: typeof pool.query }, mindId: string, skills: string[]) {
  // Keep rows (and their sub-wallet / revocation state) for skills that stay; drop the rest.
  await client.query('delete from mind_skills where mind_id = $1 and not (skill_id = any($2))', [mindId, skills])
  for (const [position, skillId] of skills.entries()) {
    await client.query(
      'insert into mind_skills (mind_id, skill_id, position) values ($1, $2, $3) on conflict (mind_id, skill_id) do update set position = excluded.position',
      [mindId, skillId, position],
    )
  }
}

export async function createMind(userId: string, body: z.infer<typeof createMindSchema>): Promise<Mind> {
  const template = (await templates()).find((t) => t.templateId === body.templateId)
  if (!template) throw new HttpError(400, 'unknown_template')
  const skills = body.skills ?? template.skills.map((s) => s.skillId)
  await assertSkills(skills)
  const id = newId('mnd')
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('insert into minds (id, user_id, template_id, name, soul, model) values ($1, $2, $3, $4, $5, $6)', [
      id, userId, template.templateId, body.name, body.soul ?? template.soul, body.model ?? template.model ?? null,
    ])
    await writeSkills(client, id, skills)
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
  return (await getMind(userId, id))!
}

export async function listMinds(userId: string): Promise<Mind[]> {
  return (await query(`${SELECT} where m.user_id = $1 order by m.created_at desc`, [userId])).map(toMind)
}

// Ownership check for every Mind route: another user's Mind looks exactly like a missing one.
export async function getMind(userId: string, mindId: string): Promise<Mind | null> {
  const [row] = await query(`${SELECT} where m.id = $1 and m.user_id = $2`, [mindId, userId])
  return row ? toMind(row) : null
}

export async function requireMind(userId: string, mindId: string): Promise<Mind> {
  const mind = await getMind(userId, mindId)
  if (!mind) throw new HttpError(404, 'mind_not_found')
  return mind
}

export async function updateMind(userId: string, mindId: string, body: z.infer<typeof updateMindSchema>): Promise<Mind> {
  await requireMind(userId, mindId)
  if (body.skills) await assertSkills(body.skills)
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(
      // A new name or soul starts a new persona version (#116); the same value sent again does not.
      `update minds set name = coalesce($3, name), soul = coalesce($4, soul), model = coalesce($5, model),
         persona_version = persona_version + (($3::text is not null and $3 is distinct from name)
           or ($4::jsonb is not null and $4::jsonb is distinct from soul))::int,
         updated_at = now()
       where id = $1 and user_id = $2`,
      [mindId, userId, body.name ?? null, body.soul ?? null, body.model ?? null],
    )
    if (body.skills) await writeSkills(client, mindId, body.skills)
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
  return (await getMind(userId, mindId))!
}

export async function deleteMind(userId: string, mindId: string): Promise<boolean> {
  return (await query('delete from minds where id = $1 and user_id = $2 returning id', [mindId, userId])).length > 0
}
