// Runs and their events (#17): the backend relays the engine's SSE events to the browser and stores every
// event in run_events, the source for the Mind Graph history, Receipts and the approval inbox.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { query } from './db.ts'
import { sseEvents } from './sse.ts'

type Event = Record<string, any> & { runId?: string; seq: number; type: string; ts: string }
type RunContext = { mindId: string; threadId?: string; workflowId?: string; resumeOf?: string }

// Deltas arrive many per second; they are written in batches, everything else right away.
const BATCHED = new Set(['text.delta', 'reasoning.delta'])
const BATCH_SIZE = 32
const HEARTBEAT_MS = 15_000

async function upsertRun(e: Event, ctx: RunContext) {
  await query(
    `insert into runs (id, mind_id, thread_id, workflow_id, status, model) values ($1, $2, $3, $4, 'running', $5)
     on conflict (id) do update set status = 'running', finished_at = null`,
    [e.runId, ctx.mindId, ctx.threadId ?? null, ctx.workflowId ?? null, e.model ?? null],
  )
}

async function updateRun(e: Event) {
  if (e.type === 'tool.approval_required') await query(`update runs set status = 'awaiting_approval' where id = $1`, [e.runId])
  if (e.type === 'run.finished') {
    await query(`update runs set status = case when status = 'awaiting_approval' then status else 'finished' end, usage = $2, cost_usd = $3, finished_at = now() where id = $1`,
      [e.runId, e.usage ?? null, e.costUsd ?? null])
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
    res.writeHead(engineRes.status >= 500 ? 502 : engineRes.status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
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

  try {
    for await (const raw of sseEvents(engineRes.body as unknown as AsyncIterable<Uint8Array>)) {
      const e = raw as Event
      if (!shiftDecided) {
        offset = e.seq >= offset ? 0 : offset - e.seq
        shiftDecided = true
      }
      e.seq += offset
      if (e.runId) runId = e.runId
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
      send(`data: ${JSON.stringify(e)}\n\n`)
    }
    await flush()
  } catch {
    await flush().catch(() => {})
    const e: Event = { v: 1, type: 'run.error', runId, mindId: ctx.mindId, seq: lastSeq + 1, ts: new Date().toISOString(), error: 'engine_stream_interrupted' }
    if (runId) {
      await insertEvents([e]).catch(() => {})
      await updateRun(e).catch(() => {})
    }
    send(`data: ${JSON.stringify(e)}\n\n`)
  } finally {
    clearInterval(heartbeat)
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
    ? await query('select * from runs where mind_id = $1 and thread_id = $2 order by started_at desc limit $3', [mindId, threadId, limit])
    : await query('select * from runs where mind_id = $1 order by started_at desc limit $2', [mindId, limit])
  return rows.map(toRun)
}

// A run of a Mind the user owns, or null.
export async function getRun(userId: string, runId: string): Promise<(RunSummary & { mindId: string }) | null> {
  const [row] = await query('select r.* from runs r join minds m on m.id = r.mind_id where r.id = $1 and m.user_id = $2', [runId, userId])
  return row ? { ...toRun(row), mindId: row.mind_id } : null
}

export async function runEvents(runId: string): Promise<unknown[]> {
  return (await query('select payload from run_events where run_id = $1 order by seq', [runId])).map((r) => r.payload)
}

// Events of all of a Mind's runs since a time, for the Mind Graph history mode. Deltas are left out:
// the graph needs nodes and edges, not text.
export async function mindEvents(mindId: string, since: Date, limit: number): Promise<unknown[]> {
  return (await query(
    `select e.payload from run_events e join runs r on r.id = e.run_id
     where r.mind_id = $1 and e.ts >= $2 and e.type not in ('text.delta', 'reasoning.delta')
     order by e.ts, e.run_id, e.seq limit $3`,
    [mindId, since, limit],
  )).map((r) => r.payload)
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
