// Engine HTTP API (docs/api-contract.md §2). Only the backend calls it, with X-Engine-Key.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { RequestContext } from '@mastra/core/request-context'
import { z } from 'zod'
import { config } from './config.ts'
import { createNormalizer } from './events.ts'
import { MIND_KEY, mastra } from './mastra.ts'
import { resourceId, runRequestSchema, type Mind } from './mind.ts'
import { SECRETS_KEY, redact, type Secret } from './secrets.ts'
import { usableSkills } from './skills.ts'
import { modelInfo, verifyCompletions } from './models.ts'
import { summarize } from './verify.ts'
import { templateSummaries } from './templates.ts'

const chatSchema = runRequestSchema.extend({ message: z.string().min(1) })
const resumeSchema = runRequestSchema.extend({ toolCallId: z.string().min(1), reason: z.string().optional() })

// Next event seq per run, so events after an approval continue the run's sequence.
// In-memory for now: a restarted engine restarts numbering for resumed runs.
const nextSeq = new Map<string, number>()

function authorized(req: IncomingMessage): boolean {
  const given = Buffer.from(String(req.headers['x-engine-key'] ?? ''))
  const expected = Buffer.from(config.engineApiKey)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

function contextFor(mind: Mind, secrets: Secret[]) {
  const requestContext = new RequestContext()
  requestContext.set(MIND_KEY, mind)
  // Not registered as a tracing requestContextKey, so tracing never records it.
  requestContext.set(SECRETS_KEY, new Map(secrets.map((s) => [s.name, s])))
  return requestContext
}

async function pipeRun(res: ServerResponse, stream: { fullStream: AsyncIterable<any> }, opts: { mindId: string; threadId: string; model: string; skills: string[]; secretValues: string[]; runId?: string }) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  const normalize = createNormalizer({ ...opts, startSeq: opts.runId ? nextSeq.get(opts.runId) : 0 })
  let runId = opts.runId
  try {
    for await (const chunk of stream.fullStream) {
      for (const event of await normalize(chunk)) {
        runId = event.runId
        nextSeq.set(runId, event.seq + 1)
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
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

const loadedSkills = (mind: Mind) => usableSkills(mind.skills.map((s) => s.skillId)).map((s) => s.name)

const agentOptions = (mind: Mind, secrets: Secret[], userId: string, mindId: string, threadId: string) => ({
  requestContext: contextFor(mind, secrets),
  memory: { resource: resourceId(userId, mindId), thread: threadId },
  maxSteps: 8,
  // No automatic retries: each completion must map to one verifiable request (NEAR AI SDK guide).
  modelSettings: { maxOutputTokens: config.maxOutputTokens, maxRetries: 0, timeout: { totalMs: config.runTimeoutMs } },
})

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://engine')
    if (req.method === 'GET' && url.pathname === '/v1/health') return sendJson(res, 200, { ok: true, mastra: '1.81.0' })
    if (!authorized(req)) return sendJson(res, 401, { error: 'unauthorized' })

    if (req.method === 'GET' && url.pathname === '/v1/templates') return sendJson(res, 200, { templates: templateSummaries() })

    const agent = mastra.getAgent('mind')

    const chat = url.pathname.match(/^\/v1\/minds\/([^/]+)\/chat$/)
    if (req.method === 'POST' && chat) {
      const parsed = chatSchema.safeParse(await readJson(req))
      if (!parsed.success) return sendJson(res, 400, { error: 'invalid_body', issues: parsed.error.issues })
      const { userId, threadId, message, mind, secrets } = parsed.data
      const mindId = decodeURIComponent(chat[1])
      const stream = await agent.stream(message, agentOptions(mind, secrets, userId, mindId, threadId))
      return pipeRun(res, stream, { mindId, threadId, model: mind.model ?? config.defaultModel, skills: loadedSkills(mind), secretValues: secrets.map((s) => s.value) })
    }

    const resume = url.pathname.match(/^\/v1\/runs\/([^/]+)\/(approve|decline)$/)
    if (req.method === 'POST' && resume) {
      const parsed = resumeSchema.safeParse(await readJson(req))
      if (!parsed.success) return sendJson(res, 400, { error: 'invalid_body', issues: parsed.error.issues })
      const { userId, threadId, mind, secrets, toolCallId, reason } = parsed.data
      const runId = decodeURIComponent(resume[1])
      const mindId = String(url.searchParams.get('mindId') ?? '')
      if (!mindId) return sendJson(res, 400, { error: 'mindId query parameter is required' })
      const options = { ...agentOptions(mind, secrets, userId, mindId, threadId), runId, toolCallId }
      const stream = resume[2] === 'approve' ? await agent.approveToolCall(options) : await agent.declineToolCall({ ...options, reason })
      return pipeRun(res, stream, { mindId, threadId, model: mind.model ?? config.defaultModel, skills: loadedSkills(mind), secretValues: secrets.map((s) => s.value), runId })
    }

    return sendJson(res, 404, { error: 'not_found' })
  } catch (e) {
    if (!res.headersSent) sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) })
    else res.end()
  }
})

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(config.port, () => console.log(`engine listening on :${config.port}`))
}
