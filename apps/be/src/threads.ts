// Chat threads (#54), built from the backend's own runs and run events: one user message per chat run
// (`runs.user_message`) and one assistant message per run with text (its `text.delta` events, in order).
// Builder runs have no thread and do not appear. Mastra keeps no thread titles (#54), so the title is the
// first user message, cut to about 60 characters.
import { query } from './db.ts'

export type Thread = { threadId: string; title: string | null; lastMessageAt: string; messageCount: number }
export type Message = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; runId: string }

export function titleOf(text: string | null, max = 60): string | null {
  if (!text) return null
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

export async function listThreads(mindId: string, limit: number): Promise<Thread[]> {
  const rows = await query<{ thread_id: string; first_message: string | null; last_at: Date; user_turns: number; replies: number }>(
    `select thread_id,
            (array_agg(user_message order by started_at) filter (where user_message is not null))[1] as first_message,
            max(coalesce(finished_at, started_at)) as last_at,
            (count(*) filter (where user_message is not null))::int as user_turns,
            (count(*) filter (where has_text))::int as replies
       from (select r.*, exists (select 1 from run_events e where e.run_id = r.id and e.type = 'text.delta') as has_text
               from runs r where r.mind_id = $1 and r.thread_id is not null) t
      group by thread_id
      order by last_at desc
      limit $2`,
    [mindId, limit],
  )
  return rows.map((r) => ({ threadId: r.thread_id, title: titleOf(r.first_message), lastMessageAt: r.last_at.toISOString(), messageCount: r.user_turns + r.replies }))
}

export async function threadExists(mindId: string, threadId: string): Promise<boolean> {
  return (await query('select 1 from runs where mind_id = $1 and thread_id = $2 limit 1', [mindId, threadId])).length > 0
}

// A page position: the last run shown, as `<ISO time>~<runId>`, so two runs that started at the same time are
// both kept. A plain ISO time is accepted too (everything that started before it).
export type Cursor = { at: Date; runId: string | null }
export function parseCursor(raw: string): Cursor | null {
  const [time, runId, ...rest] = raw.split('~')
  const at = new Date(time)
  if (rest.length || Number.isNaN(at.getTime()) || (runId !== undefined && !/^[\w-]{1,100}$/.test(runId))) return null
  return { at, runId: runId ?? null }
}

// Newest messages first are paged by run: a page holds whole runs (a user message and its reply) up to `limit`
// messages, at least one run. `nextBefore` pages further back; messages in a page are oldest first.
export async function threadMessages(mindId: string, threadId: string, limit: number, before?: Cursor): Promise<{ messages: Message[]; nextBefore: string | null }> {
  const runs = await query<{ id: string; user_message: string | null; started_at: Date }>(
    // Compared at millisecond precision: the cursor comes from a JS Date, Postgres keeps microseconds.
    `select id, user_message, started_at from (
        select *, date_trunc('milliseconds', started_at) as at_ms from runs where mind_id = $1 and thread_id = $2) r
      where $3::timestamptz is null or at_ms < $3 or (at_ms = $3 and $4::text is not null and id < $4)
      order by at_ms desc, id desc limit $5`,
    [mindId, threadId, before?.at ?? null, before?.runId ?? null, limit + 1],
  )
  const texts = new Map<string, { text: string; at: Date }>()
  if (runs.length) {
    const rows = await query<{ run_id: string; text: string; at: Date }>(
      `select run_id, string_agg(payload->>'text', '' order by seq) as text, max(ts) as at
         from run_events where run_id = any($1) and type = 'text.delta' group by run_id`,
      [runs.map((r) => r.id)],
    )
    for (const r of rows) texts.set(r.run_id, { text: r.text, at: r.at })
  }
  const page: Message[][] = []
  let count = 0
  let used = 0
  for (const r of runs) {
    const msgs: Message[] = []
    if (r.user_message !== null) msgs.push({ id: `${r.id}:user`, role: 'user', text: r.user_message, createdAt: r.started_at.toISOString(), runId: r.id })
    const reply = texts.get(r.id)
    if (reply?.text) msgs.push({ id: `${r.id}:assistant`, role: 'assistant', text: reply.text, createdAt: reply.at.toISOString(), runId: r.id })
    if (used > 0 && count + msgs.length > limit) break
    page.push(msgs)
    count += msgs.length
    used++
  }
  const more = runs.length > used
  const last = runs[used - 1]
  return { messages: page.reverse().flat(), nextBefore: more ? `${last.started_at.toISOString()}~${last.id}` : null }
}
