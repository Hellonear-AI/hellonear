// Engine HTTP API (docs/api-contract.md §2). Only the backend calls it, with X-Engine-Key.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { RequestContext } from '@mastra/core/request-context'
import { z } from 'zod'
import { config } from './config.ts'
import { createNormalizer, createWorkflowNormalizer, type HelloNearEvent } from './events.ts'
import { MIND_KEY, UNATTENDED_KEY, mastra, storage } from './mastra.ts'
import { resourceId, runRequestSchema, type Mind } from './mind.ts'
import { SECRETS_KEY, redact, type Secret } from './secrets.ts'
import { TIME_ZONE_KEY } from './tools.ts'
import { WALLET_KEY, walletContext, walletTokenSchema } from './wallet.ts'
import { MAIL_KEY, MIND_ID_KEY, mailContext, mailTokenSchema } from './mail.ts'
import { DEMO_KEY } from './email.ts'
import { USER_KEY } from './composio.ts'
import { missingTools, skillCatalogSummaries, skillDetail, usableSkills } from './skills.ts'
import { attestationStatus, modelInfo, verifyCompletions, warmAttestation } from './models.ts'
import { summarize } from './verify.ts'
import { templateSummaries, templates } from './templates.ts'
import { isNewThread, makeTitle } from './titles.ts'
import { attackIdSchema, attackSummaries, verdictOf, type AttackId } from './attacks.ts'
import { BuilderError, mastraWorkflowId, mindIdSchema, workflowIdSchema } from './builder.ts'
import { mindSchema, timeZoneSchema } from './mind.ts'
import { secretSchema } from './secrets.ts'
import { deleteWorkflow, listWorkflows, loadWorkflow, saveWorkflow } from './workflows.ts'
import { forgetThread } from './threads.ts'
import { autopilotSchema, deleteAutopilot, getAutopilot, listRuns, setAutopilot } from './autopilot.ts'

// `attackId` (#16): an Attack Playground run; the engine ends it with an `attack.verdict` event.
const chatSchema = runRequestSchema.extend({ message: z.string().min(1), attackId: attackIdSchema.optional() })
const resumeSchema = runRequestSchema.extend({ toolCallId: z.string().min(1), reason: z.string().optional(), attackId: attackIdSchema.optional() })
// A workflow run has no chat thread; the Mind config and secrets come with every run, as in chat.
const workflowRunSchema = z.object({
  userId: z.string().min(1),
  mind: mindSchema,
  secrets: z.array(secretSchema).default([]),
  input: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  walletToken: walletTokenSchema.optional(),
  mailToken: mailTokenSchema.optional(),
  demo: z.boolean().optional(),
  timeZone: timeZoneSchema.optional(),
})
// Deleting a chat (#207): the user id, so only that user's memory of the Mind can be touched.
const forgetSchema = z.object({ userId: z.string().min(1) })

// Next event seq per run, so events after an approval continue the run's sequence.
// In-memory for now: a restarted engine restarts numbering for resumed runs.
const nextSeq = new Map<string, number>()

function authorized(req: IncomingMessage): boolean {
  const given = Buffer.from(String(req.headers['x-engine-key'] ?? ''))
  const expected = Buffer.from(config.engineApiKey)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// Bodies are small (a chat message, a canvas of at most 20 nodes); refuse anything bigger.
const MAX_BODY_BYTES = 256 * 1024
class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'body_too_large')
    chunks.push(c as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw new HttpError(400, 'invalid_json')
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

function contextFor(mind: Mind, secrets: Secret[], opts: { unattended?: boolean; walletToken?: string; mailToken?: string; demo?: boolean; userId?: string; mindId?: string; timeZone?: string } = {}) {
  const requestContext = new RequestContext()
  requestContext.set(MIND_KEY, mind)
  // The run's user: Composio sessions (Gmail) are opened for this user only (#13).
  if (opts.userId) requestContext.set(USER_KEY, opts.userId)
  // The run's Mind, for Autopilot's "Email me" (#146). Not a secret.
  if (opts.mindId) requestContext.set(MIND_ID_KEY, opts.mindId)
  if (opts.unattended) requestContext.set(UNATTENDED_KEY, true)
  // Not registered as a tracing requestContextKey, so tracing never records it.
  requestContext.set(SECRETS_KEY, new Map(secrets.map((s) => [s.name, s])))
  requestContext.set(WALLET_KEY, walletContext(opts.walletToken))
  requestContext.set(MAIL_KEY, mailContext(opts.mailToken))
  if (opts.demo) requestContext.set(DEMO_KEY, true)
  // The owner's time zone (#112): get_time gives the local date, time and weekday.
  if (opts.timeZone) requestContext.set(TIME_ZONE_KEY, opts.timeZone)
  return requestContext
}

// Values no event may carry: the owner's secrets and the run's wallet and mail tokens.
const hiddenValues = (secrets: Secret[], ...tokens: (string | undefined)[]) => [...secrets.map((s) => s.value), ...tokens.filter((t): t is string => !!t)]

async function pipeRun(res: ServerResponse, stream: { fullStream: AsyncIterable<any> }, opts: { mindId: string; threadId: string; model: string; skills: string[]; secretValues: string[]; runId?: string; title?: Promise<string | null>; attack?: { id: AttackId; skills: string[] } }) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  const normalize = createNormalizer({ ...opts, startSeq: opts.runId ? nextSeq.get(opts.runId) : 0 })
  let runId = opts.runId
  const seen: HelloNearEvent[] = []
  try {
    for await (const chunk of stream.fullStream) {
      for (const event of await normalize(chunk)) {
        seen.push(event)
        runId = event.runId
        nextSeq.set(runId, event.seq + 1)
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
    }
    // Stopped (#121): the client is gone, so skip the title, the verdict and the verification.
    if (res.destroyed) return
    // A thread's first run gets a short title (#86), made while the run streamed; no title is fine.
    if (runId && opts.title) {
      const title = await opts.title
      if (title) {
        const event = normalize.event(runId, 'thread.titled', { threadId: opts.threadId, title })
        nextSeq.set(runId, event.seq + 1)
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
    }
    // Attack Playground (#16): which layer stopped the attack in this run.
    if (runId && opts.attack) {
      const event = normalize.event(runId, 'attack.verdict', verdictOf(opts.attack.id, opts.attack.skills, seen as any))
      nextSeq.set(runId, event.seq + 1)
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    // The stream is fully read, so the SDK holds every completion's bytes: verify them (#19).
    if (runId) {
      const info = await modelInfo(opts.model)
      const ids = normalize.completionIds()
      const verification = summarize(info?.verifiable === true, info?.verifiable ? await verifyCompletions(ids) : [])
      const event = normalize.verified(runId, verification)
      nextSeq.set(runId, event.seq + 1)
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  } catch (e) {
    const event = { v: 1, type: 'run.error', runId, mindId: opts.mindId, seq: runId ? nextSeq.get(runId) ?? 0 : 0, ts: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) }
    res.write(`data: ${JSON.stringify(redact(event, opts.secretValues))}\n\n`)
  }
  res.end()
}

// Streams a builder workflow run (#20) as HelloNear events, ending with run.verified like chat.
async function pipeWorkflow(res: ServerResponse, run: { stream: (args: any) => { fullStream: AsyncIterable<any> } }, opts: { mindId: string; workflowId: string; model: string; skills: string[]; secrets: Secret[]; walletToken?: string; mailToken?: string; demo?: boolean; timeZone?: string; userId: string; mind: Mind; input: Record<string, unknown>; steps: Parameters<typeof createWorkflowNormalizer>[0]['steps'] }) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  const secretValues = hiddenValues(opts.secrets, opts.walletToken, opts.mailToken)
  const normalize = createWorkflowNormalizer({ ...opts, secretValues })
  let runId: string | undefined
  let seq = 0
  const write = (event: { runId: string; seq: number }) => {
    runId = event.runId
    seq = event.seq + 1
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  try {
    const out = run.stream({ inputData: opts.input, requestContext: contextFor(opts.mind, opts.secrets, { unattended: true, walletToken: opts.walletToken, mailToken: opts.mailToken, demo: opts.demo, userId: opts.userId, mindId: opts.mindId, timeZone: opts.timeZone }) })
    for await (const chunk of out.fullStream) for (const event of await normalize(chunk)) write(event)
    if (runId) {
      const info = await modelInfo(opts.model)
      const ids = normalize.completionIds()
      write(normalize.verified(runId, summarize(info?.verifiable === true, info?.verifiable ? await verifyCompletions(ids) : [])))
    }
  } catch (e) {
    const event = { v: 1, type: 'run.error', runId, mindId: opts.mindId, seq, ts: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) }
    res.write(`data: ${JSON.stringify(redact(event, secretValues))}\n\n`)
  }
  res.end()
}

const loadedSkills = (mind: Mind) => usableSkills(mind.skills.map((s) => s.skillId)).map((s) => s.name)

// Stop (#121): when the backend drops the request (the owner pressed Stop, or the browser left and the backend
// cancelled), abort the agent so no more model calls are made. A tool already running finishes on its own terms:
// the wallet and mail tools call the backend without this signal, so a payment is never left half-done.
function abortOnClose(res: ServerResponse): AbortSignal {
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort(new Error('client closed the stream')) })
  return controller.signal
}

const agentOptions = (mind: Mind, secrets: Secret[], userId: string, mindId: string, threadId: string, tokens: { walletToken?: string; mailToken?: string; timeZone?: string }, demo?: boolean) => ({
  requestContext: contextFor(mind, secrets, { ...tokens, demo, userId, mindId }),
  memory: { resource: resourceId(userId, mindId, mind.personaVersion), thread: threadId },
  maxSteps: 8,
  // No automatic retries: each completion must map to one verifiable request (NEAR AI SDK guide).
  modelSettings: { maxOutputTokens: config.maxOutputTokens, maxRetries: 0, timeout: { totalMs: config.runTimeoutMs } },
})

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://engine')
    if (req.method === 'GET' && url.pathname === '/v1/health') return sendJson(res, 200, { ok: true, mastra: '1.81.0', attestation: attestationStatus() })
    if (!authorized(req)) return sendJson(res, 401, { error: 'unauthorized' })

    if (req.method === 'GET' && url.pathname === '/v1/templates') return sendJson(res, 200, { templates: templateSummaries() })
    if (req.method === 'GET' && url.pathname === '/v1/skills') return sendJson(res, 200, { skills: skillCatalogSummaries() })
    // Skill ids are [a-z0-9-] (skills.ts), so anything else falls through to 404 without decoding.
    const skillPath = url.pathname.match(/^\/v1\/skills\/([a-z0-9-]+)$/)
    if (req.method === 'GET' && skillPath) {
      const skill = skillDetail(skillPath[1])
      return skill ? sendJson(res, 200, { skill }) : sendJson(res, 404, { error: 'not_found' })
    }
    if (req.method === 'GET' && url.pathname === '/v1/attacks') return sendJson(res, 200, { attacks: attackSummaries() })

    const agent = mastra.getAgent('mind')

    const chat = url.pathname.match(/^\/v1\/minds\/([^/]+)\/chat$/)
    if (req.method === 'POST' && chat) {
      const parsed = chatSchema.safeParse(await readJson(req))
      if (!parsed.success) return sendJson(res, 400, { error: 'invalid_body', issues: parsed.error.issues })
      const { userId, threadId, message, mind, secrets, walletToken, mailToken, demo, attackId, timeZone } = parsed.data
      const mindId = decodeURIComponent(chat[1])
      const attack = attackId ? { id: attackId, skills: mind.skills.map((s) => s.skillId) } : undefined
      // Started before the run so it is usually ready when the run ends; it never throws.
      const title = (await isNewThread(threadId)) ? makeTitle(message) : undefined
      const stream = await agent.stream(message, { ...agentOptions(mind, secrets, userId, mindId, threadId, { walletToken, mailToken, timeZone }, demo), abortSignal: abortOnClose(res) })
      return pipeRun(res, stream, { mindId, threadId, model: mind.model ?? config.defaultModel, skills: loadedSkills(mind), secretValues: hiddenValues(secrets, walletToken, mailToken), title, attack })
    }

    const resume = url.pathname.match(/^\/v1\/runs\/([^/]+)\/(approve|decline)$/)
    if (req.method === 'POST' && resume) {
      const parsed = resumeSchema.safeParse(await readJson(req))
      if (!parsed.success) return sendJson(res, 400, { error: 'invalid_body', issues: parsed.error.issues })
      const { userId, threadId, mind, secrets, walletToken, mailToken, demo, toolCallId, reason, attackId, timeZone } = parsed.data
      const runId = decodeURIComponent(resume[1])
      const mindId = String(url.searchParams.get('mindId') ?? '')
      if (!mindId) return sendJson(res, 400, { error: 'mindId query parameter is required' })
      const options = { ...agentOptions(mind, secrets, userId, mindId, threadId, { walletToken, mailToken, timeZone }, demo), runId, toolCallId, abortSignal: abortOnClose(res) }
      const stream = resume[2] === 'approve' ? await agent.approveToolCall(options) : await agent.declineToolCall({ ...options, reason })
      return pipeRun(res, stream, { mindId, threadId, model: mind.model ?? config.defaultModel, skills: loadedSkills(mind), secretValues: hiddenValues(secrets, walletToken, mailToken), runId, attack: attackId ? { id: attackId, skills: mind.skills.map((s) => s.skillId) } : undefined })
    }

    // The owner deleted a chat (#207): its Mastra thread, messages and recall embeddings go now; working memory stays.
    // 204 also when Mastra has no such thread, so the backend can ask again until it gets a 204.
    const thread = url.pathname.match(/^\/v1\/minds\/([^/]+)\/threads\/([^/]+)$/)
    if (thread && req.method === 'DELETE') {
      const mindId = decodeURIComponent(thread[1])
      const threadId = decodeURIComponent(thread[2])
      if (!mindIdSchema.safeParse(mindId).success || !threadId) return sendJson(res, 400, { error: 'invalid_id' })
      const parsed = forgetSchema.safeParse(await readJson(req))
      if (!parsed.success) return sendJson(res, 400, { error: 'invalid_body', issues: parsed.error.issues })
      const out = await forgetThread(parsed.data.userId, mindId, threadId)
      return out === 'not_owner' ? sendJson(res, 404, { error: 'thread_not_found' }) : res.writeHead(204).end()
    }

    const wfList = url.pathname.match(/^\/v1\/minds\/([^/]+)\/workflows$/)
    const wf = url.pathname.match(/^\/v1\/minds\/([^/]+)\/workflows\/([^/]+)(\/runs|\/autopilot)?$/)
    if (wfList || wf) {
      const mindId = decodeURIComponent((wfList ?? wf)![1])
      const workflowId = wf ? decodeURIComponent(wf[2]) : ''
      if (!mindIdSchema.safeParse(mindId).success || (wf && !workflowIdSchema.safeParse(workflowId).success)) return sendJson(res, 400, { error: 'invalid_id' })
      if (wfList && req.method === 'GET') return sendJson(res, 200, { workflows: await listWorkflows(mindId) })
      if (wf && !wf[3] && req.method === 'PUT') {
        try {
          return sendJson(res, 200, await saveWorkflow(mindId, workflowId, await readJson(req)))
        } catch (e) {
          if (e instanceof BuilderError) return sendJson(res, 400, { error: 'invalid_workflow', issues: e.issues })
          // Mastra's own validation (e.g. a reference to a field the tool does not return).
          if (e instanceof Error && /failed validation/.test(e.message)) return sendJson(res, 400, { error: 'invalid_workflow', issues: [{ path: 'graph', message: e.message }] })
          throw e
        }
      }
      if (wf && !wf[3] && req.method === 'GET') {
        const found = await loadWorkflow(mindId, workflowId)
        return found ? sendJson(res, 200, found) : sendJson(res, 404, { error: 'not_found' })
      }
      if (wf && !wf[3] && req.method === 'DELETE') return (await deleteWorkflow(mindId, workflowId)) ? res.writeHead(204).end() : sendJson(res, 404, { error: 'not_found' })
      if (wf?.[3] === '/runs' && req.method === 'POST') {
        const parsed = workflowRunSchema.safeParse(await readJson(req))
        if (!parsed.success) return sendJson(res, 400, { error: 'invalid_body', issues: parsed.error.issues })
        const { userId, mind, secrets, walletToken, mailToken, demo, input, timeZone } = parsed.data
        const saved = await loadWorkflow(mindId, workflowId)
        if (!saved) return sendJson(res, 404, { error: 'not_found' })
        // A workflow may only use tools its Mind has equipped right now (skills can be unequipped after saving).
        const missing = missingTools(mind.skills.map((s) => s.skillId), saved.tools)
        if (missing.length) return sendJson(res, 409, { error: 'missing_tools', tools: missing })
        let workflow
        try {
          workflow = mastra.getWorkflow(mastraWorkflowId(mindId, workflowId))
        } catch {
          // Saved by another engine process: register it here from the stored canvas.
          await saveWorkflow(mindId, workflowId, saved.canvas)
          workflow = mastra.getWorkflow(mastraWorkflowId(mindId, workflowId))
        }
        const run = await workflow.createRun()
        return pipeWorkflow(res, run as never, { mindId, workflowId, model: mind.model ?? config.defaultModel, skills: loadedSkills(mind), secrets, walletToken, mailToken, demo, timeZone, userId, mind, input, steps: saved.steps })
      }
      if (wf?.[3] === '/runs' && req.method === 'GET') {
        const saved = await loadWorkflow(mindId, workflowId)
        if (!saved) return sendJson(res, 404, { error: 'not_found' })
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20) || 20, 1), 100)
        return sendJson(res, 200, { runs: await listRuns(mindId, workflowId, saved.steps, limit) })
      }
      if (wf?.[3] === '/autopilot') {
        const saved = await loadWorkflow(mindId, workflowId)
        if (!saved) return sendJson(res, 404, { error: 'not_found' })
        if (req.method === 'GET') return sendJson(res, 200, { autopilot: await getAutopilot(mindId, workflowId) })
        if (req.method === 'DELETE') return (await deleteAutopilot(mindId, workflowId)) ? res.writeHead(204).end() : sendJson(res, 404, { error: 'not_found' })
        if (req.method === 'PUT') {
          const parsed = autopilotSchema.safeParse(await readJson(req))
          if (!parsed.success) return sendJson(res, 400, { error: 'invalid_body', issues: parsed.error.issues })
          const out = await setAutopilot(mindId, workflowId, saved, parsed.data)
          return 'issues' in out ? sendJson(res, 409, { error: 'cannot_autopilot', ...out }) : sendJson(res, 200, out)
        }
      }
      return sendJson(res, 405, { error: 'method_not_allowed' })
    }

    return sendJson(res, 404, { error: 'not_found' })
  } catch (e) {
    if (e instanceof HttpError && !res.headersSent) return sendJson(res, e.status, { error: e.message })
    if (!res.headersSent) sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) })
    else res.end()
  }
})

// Models whose attestation the engine keeps warm: the default and every template's model.
export const warmModels = () => [config.defaultModel, ...templates.map((t) => t.model)]

if (import.meta.url === `file://${process.argv[1]}`) {
  // startWorkers() loads the workflows saved in Postgres (#20); without it they vanish on restart.
  await mastra.startWorkers()
  server.listen(config.port, () => console.log(`engine listening on :${config.port}`))
  const warm = () => warmAttestation(warmModels()).then(() => console.log('attestation', JSON.stringify(attestationStatus())))
  void warm()
  setInterval(warm, 50 * 60 * 1000).unref()
  // Mastra never prunes by itself. Hourly, in bounded batches, so a big backlog never blocks the engine.
  const prune = () => storage.prune({ maxRows: 10_000 }).then((r) => console.log('prune', JSON.stringify(r.filter((x) => x.deleted))), (e) => console.error('prune failed', e))
  setInterval(prune, 60 * 60 * 1000).unref()
}
