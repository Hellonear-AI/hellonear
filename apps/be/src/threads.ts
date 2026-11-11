// Chat threads (#54), built from the backend's own runs and run events: one user message per chat run
// (`runs.user_message`) and one assistant message per run with text (its `text.delta` events, in order).
// Builder runs have no thread and do not appear. Mastra keeps no thread titles (#54), so the title is the
// first user message, cut to about 60 characters, until the engine sends a short summary as a
// `thread.titled` event (#86); then the newest such title wins. Both go through `titleOf`. A title the owner set
// (#207, `thread_meta.title`) wins over both. A thread the owner deleted (#207) is left out everywhere.
import { z } from 'zod'
import { query } from './db.ts'

// A run whose thread the owner deleted (#207) is hidden, for the 30 days until the purge removes it. For SQL over
// `runs` aliased `r`.
export const NOT_DELETED = `not exists (select 1 from thread_meta d where d.mind_id = r.mind_id and d.thread_id = r.thread_id and d.deleted_at is not null)`
import { HttpError } from './http.ts'
import { engineFetch } from './engine.ts'

export type Thread = { threadId: string; title: string | null; lastMessageAt: string; messageCount: number }
export type Message = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; runId: string }

export function titleOf(text: string | null, max = 60): string | null {
  if (!text) return null
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return null
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

export async function listThreads(mindId: string, limit: number, threadId?: string): Promise<Thread[]> {
  const rows = await query<{ thread_id: string; owner_title: string | null; first_message: string | null; summary: string | null; last_at: Date; user_turns: number; replies: number }>(
    `select thread_id,
            (select tm.title from thread_meta tm where tm.mind_id = $1 and tm.thread_id = t.thread_id) as owner_title,
            (array_agg(user_message order by started_at) filter (where user_message is not null))[1] as first_message,
            (select e.payload->>'title' from run_events e join runs r2 on r2.id = e.run_id
              where r2.mind_id = $1 and r2.thread_id = t.thread_id and e.type = 'thread.titled'
              order by e.ts desc, e.seq desc limit 1) as summary,
            max(coalesce(finished_at, started_at)) as last_at,
            (count(*) filter (where user_message is not null))::int as user_turns,
            (count(*) filter (where has_text))::int as replies
       from (select r.*, exists (select 1 from run_events e where e.run_id = r.id and e.type = 'text.delta') as has_text
               from runs r where r.mind_id = $1 and r.thread_id is not null and ($3::text is null or r.thread_id = $3) and ${NOT_DELETED}) t
      group by thread_id
      order by last_at desc
      limit $2`,
    [mindId, limit, threadId ?? null],
  )
  return rows.map((r) => ({ threadId: r.thread_id, title: r.owner_title ?? titleOf(r.summary) ?? titleOf(r.first_message), lastMessageAt: r.last_at.toISOString(), messageCount: r.user_turns + r.replies }))
}

export async function threadExists(mindId: string, threadId: string): Promise<boolean> {
  return (await query(`select 1 from runs r where r.mind_id = $1 and r.thread_id = $2 and ${NOT_DELETED} limit 1`, [mindId, threadId])).length > 0
}

// Rename (#207): the owner's title, 1 to 60 characters after trimming, with runs of whitespace made one space.
export const threadTitleSchema = z.object({ title: z.string().transform((t) => t.replace(/\s+/g, ' ').trim()).pipe(z.string().min(1).max(60)) })
export async function renameThread(mindId: string, threadId: string, title: string): Promise<Thread> {
  if (!(await threadExists(mindId, threadId))) throw new HttpError(404, 'thread_not_found')
  await query(
    `insert into thread_meta (mind_id, thread_id, title) values ($1, $2, $3)
     on conflict (mind_id, thread_id) do update set title = excluded.title, updated_at = now()`,
    [mindId, threadId, title],
  )
  return (await listThreads(mindId, 1, threadId))[0]
}

// Delete (#207), decided by Ancung on #207 like ChatGPT, Claude and Gemini: the chat is gone for the owner at once
// (every list, its messages, its runs, chatting on in it: all 404), and purged for good 30 days later; no undo.
// Refused while a run of the thread streams or waits for an approval, since that would leave a reply or an approval
// with no chat. Payments have no link to runs, so receipts stay in the wallet either way. The engine is asked to
// forget the thread's memory at once (its Mastra messages and their recall embeddings; working memory is per Mind
// and stays); if it cannot yet, the sweep asks again until it answers 204.
export const PURGE_AFTER_DAYS = 30
export async function deleteThread(mindId: string, threadId: string): Promise<void> {
  if (!(await threadExists(mindId, threadId))) throw new HttpError(404, 'thread_not_found')
  const busy = await query(`select 1 from runs where mind_id = $1 and thread_id = $2 and status in ('running', 'awaiting_approval') limit 1`, [mindId, threadId])
  if (busy.length) throw new HttpError(409, 'thread_busy')
  await query(
    `insert into thread_meta (mind_id, thread_id, deleted_at) values ($1, $2, now())
     on conflict (mind_id, thread_id) do update set deleted_at = now(), updated_at = now()`,
    [mindId, threadId],
  )
  // A Telegram chat (#168) continues its current thread; once that thread is gone, the next message starts a new one.
  await query('update mind_telegram set thread_id = null, updated_at = now() where mind_id = $1 and thread_id = $2', [mindId, threadId])
  await forget(mindId, threadId)
}

// The engine's DELETE /v1/minds/{mindId}/threads/{threadId} { userId } (docs/api-contract.md §2). true once it answered
// 204. A 404 means the engine has no such thread for this owner and Mind: nothing to forget, so it is not asked again.
async function forget(mindId: string, threadId: string): Promise<boolean> {
  const [owner] = await query<{ user_id: string }>('select user_id from minds where id = $1', [mindId])
  if (!owner) return false
  const status = await engineFetch(`/v1/minds/${encodeURIComponent(mindId)}/threads/${encodeURIComponent(threadId)}`, { method: 'DELETE', body: { userId: owner.user_id } })
    .then((r) => r.status, () => 0)
  if (status !== 204 && status !== 404) return false
  await query('update thread_meta set forgotten_at = now(), updated_at = now() where mind_id = $1 and thread_id = $2', [mindId, threadId])
  return true
}

// Run by the backend every hour: asks the engine again for deleted threads it has not forgotten yet, then removes for
// good the runs (events cascade) of threads deleted more than PURGE_AFTER_DAYS ago, and their meta row.
export async function sweepDeletedThreads(now = new Date()): Promise<{ forgotten: number; purged: number }> {
  let forgotten = 0
  for (const t of await query<{ mind_id: string; thread_id: string }>('select mind_id, thread_id from thread_meta where deleted_at is not null and forgotten_at is null limit 200')) {
    if (await forget(t.mind_id, t.thread_id)) forgotten++
  }
  const old = await query<{ mind_id: string; thread_id: string }>(
    `select mind_id, thread_id from thread_meta where deleted_at < $1::timestamptz - make_interval(days => $2)`, [now, PURGE_AFTER_DAYS])
  for (const t of old) {
    await query('delete from runs where mind_id = $1 and thread_id = $2', [t.mind_id, t.thread_id])
    await query('delete from thread_meta where mind_id = $1 and thread_id = $2', [t.mind_id, t.thread_id])
  }
  return { forgotten, purged: old.length }
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
