// Runs and their events (#17): the backend relays the engine's SSE events to the browser and stores every
// event in run_events, the source for the Mind Graph history, Receipts and the approval inbox.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { query } from './db.ts'
import { UPSTREAM_ERROR, logServerError } from './http.ts'
import { sseEvents } from './sse.ts'
import { NOT_DELETED } from './threads.ts'

type Event = Record<string, any> & { runId?: string; seq: number; type: string; ts: string }
// `controller` aborts the engine request (passed to engineFetch as its signal) when the run is canceled (#121).
type RunContext = { mindId: string; threadId?: string; workflowId?: string; resumeOf?: string; userMessage?: string; controller?: AbortController }

// Runs this process is relaying right now (#121). Cancel aborts the engine request; the relay then stores the
// run as canceled and ends the stream. A run that is not here (finished, paused for approval, or relayed before
// a backend restart) is not running.
type Live = { controller: AbortController; canceled: boolean; done: Promise<void> }
const live = new Map<string, Live>()

// Cancels a live run and resolves once the relay has stored it; null when the run is not live.
export function cancelRun(runId: string): Promise<void> | null {
  const run = live.get(runId)
  if (!run) return null
  run.canceled = true
  run.controller.abort()
  return run.done
}

// Deltas arrive many per second; they are written in batches, everything else right away.
const BATCHED = new Set(['text.delta', 'reasoning.delta'])
const BATCH_SIZE = 32
const HEARTBEAT_MS = 15_000

async function upsertRun(e: Event, ctx: RunContext) {
  await query(
    `insert into runs (id, mind_id, thread_id, workflow_id, status, model, user_message) values ($1, $2, $3, $4, 'running', $5, $6)
     on conflict (id) do update set status = 'running', finished_at = null`,
    [e.runId, ctx.mindId, ctx.threadId ?? null, ctx.workflowId ?? null, e.model ?? null, ctx.userMessage ?? null],
  )
}

async function updateRun(e: Event) {
  if (e.type === 'tool.approval_required') await query(`update runs set status = 'awaiting_approval' where id = $1`, [e.runId])
  if (e.type === 'run.finished') {
    await query(`update runs set status = case when status = 'awaiting_approval' then status else 'finished' end, usage = $2, cost_usd = $3, finished_at = now() where id = $1`,
      [e.runId, e.usage ?? null, e.costUsd ?? null])
    // One line per run in the journal, to watch the shared NEAR AI credit (#43). No content, only counts.
    console.log('run usage', JSON.stringify({ runId: e.runId, mindId: e.mindId ?? null, model: e.model ?? null, usage: e.usage ?? null, costUsd: e.costUsd ?? null }))
  }
  if (e.type === 'workflow.finished') await query('update runs set status = $2, finished_at = now() where id = $1', [e.runId, String(e.status ?? 'finished')])
  if (e.type === 'run.error') await query(`update runs set status = 'error', finished_at = now() where id = $1`, [e.runId])
}

async function insertEvents(events: Event[]) {
  if (!events.length) return
  const values: unknown[] = []
  const rows = events.map((e, i) => {
    values.push(e.runId, e.seq, e.type, e.nodeId ?? null, JSON.stringify(e), e.ts)
    const o = i * 6
    return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`
  })
  // A duplicate (runId, seq) is the same event delivered twice; keep the first.
  await query(`insert into run_events (run_id, seq, type, node_id, payload, ts) values ${rows.join(', ')} on conflict do nothing`, values)
}

// Relays an engine SSE response to the browser and stores its events. The engine is read to the end even if
// the browser goes away, so the history stays complete. A non-SSE engine answer (4xx) is passed through.
export async function relayRun(req: IncomingMessage, res: ServerResponse, engineRes: Response, ctx: RunContext) {
  if (engineRes.status !== 200 || !engineRes.body) {
    const body = await engineRes.json().catch(() => ({ error: 'engine_error' }))
    if (engineRes.status >= 500) logServerError(req, UPSTREAM_ERROR, 'engine_error', { engineStatus: engineRes.status })
    res.writeHead(engineRes.status >= 500 ? UPSTREAM_ERROR : engineRes.status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    return
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' })
  let browserGone = false
  req.on('close', () => { browserGone = true })
  const send = (text: string) => { if (!browserGone) res.write(text) }
  const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS)

  // A resumed run continues the paused run's seq, unless the engine restarted and numbers from 0 again
  // (its counter is in memory): then shift the new events after the ones already stored.
  let offset = 0
  if (ctx.resumeOf) {
    const [row] = await query<{ next: number }>('select coalesce(max(seq) + 1, 0) as next from run_events where run_id = $1', [ctx.resumeOf])
    offset = row.next
  }
  let shiftDecided = !ctx.resumeOf
  let runId = ctx.resumeOf
  let lastSeq = -1
  let runStored = false
  let pending: Event[] = []
  const flush = async () => { await insertEvents(pending); pending = [] }
  let finishLive = () => {}
  let entry: Live | undefined
  const register = (id: string) => {
    if (entry || !ctx.controller) return
    entry = { controller: ctx.controller, canceled: false, done: new Promise((resolve) => { finishLive = resolve }) }
    live.set(id, entry)
  }
  if (runId) register(runId)

  try {
    for await (const raw of sseEvents(engineRes.body as unknown as AsyncIterable<Uint8Array>)) {
      const e = raw as Event
      if (!shiftDecided) {
        offset = e.seq >= offset ? 0 : offset - e.seq
        shiftDecided = true
      }
      e.seq += offset
      if (e.runId) { runId = e.runId; register(runId) }
      lastSeq = e.seq
      if (e.runId) {
        // The run row exists before its first event is stored: from run.started / workflow.started,
        // or, for a resumed run (which starts with neither), from its first event.
        if (!runStored || e.type === 'run.started' || e.type === 'workflow.started') {
          await upsertRun(e, ctx)
          runStored = true
        }
        pending.push(e)
        if (!BATCHED.has(e.type) || pending.length >= BATCH_SIZE) {
          await flush()
          await updateRun(e)
        }
      }
      send(`data: ${JSON.stringify(withoutProof(e))}\n\n`)
    }
    await flush()
  } catch {
    await flush().catch(() => {})
    const ts = new Date().toISOString()
    if (entry?.canceled) {
      // Canceled (#121): the stream ends like any other run, with its finish event and status canceled.
      const e: Event = { v: 1, type: ctx.workflowId ? 'workflow.finished' : 'run.finished', runId, mindId: ctx.mindId, seq: lastSeq + 1, ts, status: 'canceled', finishReason: 'canceled' }
      if (runId) {
        await insertEvents([e]).catch(() => {})
        await query(`update runs set status = 'canceled', finished_at = now() where id = $1`, [runId]).catch(() => {})
      }
      send(`data: ${JSON.stringify(e)}\n\n`)
    } else {
      const e: Event = { v: 1, type: 'run.error', runId, mindId: ctx.mindId, seq: lastSeq + 1, ts, error: 'engine_stream_interrupted' }
      if (runId) {
        await insertEvents([e]).catch(() => {})
        await updateRun(e).catch(() => {})
      }
      send(`data: ${JSON.stringify(e)}\n\n`)
    }
  } finally {
    clearInterval(heartbeat)
    if (runId && entry && live.get(runId) === entry) live.delete(runId)
    finishLive()
    res.end()
  }
}

export type RunSummary = { runId: string; threadId: string | null; workflowId: string | null; status: string; model: string | null; usage: unknown; costUsd: number | null; startedAt: string; finishedAt: string | null }

const toRun = (r: any): RunSummary => ({
  runId: r.id, threadId: r.thread_id, workflowId: r.workflow_id, status: r.status, model: r.model, usage: r.usage,
  costUsd: r.cost_usd === null ? null : Number(r.cost_usd), startedAt: r.started_at.toISOString(), finishedAt: r.finished_at?.toISOString() ?? null,
})

export async function listRuns(mindId: string, limit: number, threadId?: string): Promise<RunSummary[]> {
  const rows = threadId
    ? await query(`select * from runs r where r.mind_id = $1 and r.thread_id = $2 and ${NOT_DELETED} order by r.started_at desc limit $3`, [mindId, threadId, limit])
    : await query(`select * from runs r where r.mind_id = $1 and ${NOT_DELETED} order by r.started_at desc limit $2`, [mindId, limit])
  return rows.map(toRun)
}

// A run of a Mind the user owns, or null.
export async function getRun(userId: string, runId: string): Promise<(RunSummary & { mindId: string }) | null> {
  const [row] = await query(`select r.* from runs r join minds m on m.id = r.mind_id where r.id = $1 and m.user_id = $2 and ${NOT_DELETED}`, [runId, userId])
  return row ? { ...toRun(row), mindId: row.mind_id } : null
}

// The proof behind the verified badge (#254, `run.verified.verification.proof`, ~12 KB with its Intel quote) is stored
// with the event but left out of everything that streams or lists events; `GET /v1/runs/{runId}/proof` serves it alone.
const NO_PROOF = `payload #- '{verification,proof}'`
export function withoutProof(e: Event): Event {
  const v = e.verification as Record<string, unknown> | undefined
  if (e.type !== 'run.verified' || !v || typeof v !== 'object' || !('proof' in v)) return e
  const { proof: _proof, ...rest } = v
  return { ...e, verification: rest }
}

export async function runEvents(runId: string): Promise<unknown[]> {
  return (await query(`select ${NO_PROOF} as payload from run_events where run_id = $1 order by seq`, [runId])).map((r) => r.payload)
}

// Every proof a run carries, in order: a run paused for approval ends each part with its own `run.verified`.
export type RunProof = { seq: number; model: string | null; level: string | null; proof: unknown }
export async function runProofs(runId: string): Promise<RunProof[]> {
  return (await query(
    `select seq, payload->>'model' as model, payload->'verification'->>'level' as level, payload->'verification'->'proof' as proof
     from run_events where run_id = $1 and type = 'run.verified' and payload->'verification'->'proof' is not null order by seq`,
    [runId],
  )).map((r) => ({ seq: r.seq, model: r.model ?? null, level: r.level ?? null, proof: r.proof }))
}

// Events of all of a Mind's runs since a time, for the Mind Graph history mode. Deltas are left out:
// the graph needs nodes and edges, not text.
export async function mindEvents(mindId: string, since: Date, limit: number): Promise<unknown[]> {
  return (await query(
    `select e.${NO_PROOF} as payload from run_events e join runs r on r.id = e.run_id
     where r.mind_id = $1 and e.ts >= $2 and e.type not in ('text.delta', 'reasoning.delta')
     order by e.ts, e.run_id, e.seq limit $3`,
    [mindId, since, limit],
  )).map((r) => r.payload)
}

// Whether a run still waits for the owner's answer on this tool call: the run is paused and the call's
// `tool.approval_required` belongs to the current pause. Every paused stream ends with `run.finished`, so an approval of
// the current pause has at most that one after it; one from an earlier pause (a split bill's first payment, answered
// already) has two or more and no longer counts. So a stale button or card can never resume the run with a call it went
// past (#208). Counting pauses, not tool events, keeps parallel tool calls in one step (whose order is not proven) safe.
export async function isAwaiting(runId: string, toolCallId: string): Promise<boolean> {
  const [row] = await query(
    `select 1 from runs r join run_events a on a.run_id = r.id and a.type = 'tool.approval_required' and a.payload->>'toolCallId' = $2
     where r.id = $1 and r.status = 'awaiting_approval'
       and (select count(*) from run_events w where w.run_id = r.id and w.seq > a.seq and w.type = 'run.finished') <= 1
     limit 1`, [runId, toolCallId])
  return row !== undefined
}

// Runs left `running` by a backend that died mid-stream (#218): not relayed by this process, and no event for longer
// than STUCK_AFTER_MS (the engine gives up on a run after 2 minutes). Such a run can't be answered or canceled, and its
// chat can't be deleted (`409 thread_busy`). An answer to an approval claims the run (`running`) a moment before its
// first new event arrives, so a run is only swept when the previous sweep already saw it stuck at the same last event.
// It then gets a `run.error` (`run_interrupted`), like a stream that broke, so the chat shows it ended.
export const STUCK_AFTER_MS = 5 * 60_000
let suspects = new Map<string, number>()
export async function sweepStuckRuns(now = Date.now()): Promise<number> {
  const rows = await query<{ id: string; mind_id: string; last_seq: number }>(
    `select r.id, r.mind_id, coalesce(max(e.seq), 0)::int as last_seq from runs r left join run_events e on e.run_id = r.id
     where r.status = 'running' group by r.id
     having greatest(r.started_at, max(e.ts)) < $1`,
    [new Date(now - STUCK_AFTER_MS)])
  const seen = new Map<string, number>()
  let swept = 0
  for (const r of rows) {
    if (live.has(r.id)) continue
    if (suspects.get(r.id) !== r.last_seq) { seen.set(r.id, r.last_seq); continue }
    const e: Event = { v: 1, type: 'run.error', runId: r.id, mindId: r.mind_id, seq: r.last_seq + 1, ts: new Date(now).toISOString(), error: 'run_interrupted' }
    const [ended] = await query(`update runs set status = 'error', finished_at = now() where id = $1 and status = 'running' returning 1`, [r.id])
    if (!ended) continue
    await insertEvents([e])
    console.log('stuck run ended', JSON.stringify({ runId: r.id, mindId: r.mind_id }))
    swept++
  }
  suspects = seen
  return swept
}

// The approval inbox (#14): runs paused on a wallet action, with the action waiting for the owner.
export async function pendingApprovals(mindId: string): Promise<unknown[]> {
  return (await query(
    `select r.id as run_id, r.thread_id, e.payload from runs r
     join lateral (select payload from run_events where run_id = r.id and type = 'tool.approval_required' order by seq desc limit 1) e on true
     where r.mind_id = $1 and r.status = 'awaiting_approval' order by r.started_at desc`,
    [mindId],
  )).map((r) => ({ runId: r.run_id, threadId: r.thread_id, toolCallId: r.payload.toolCallId, tool: r.payload.tool, args: r.payload.args, requestedAt: r.payload.ts }))
}
