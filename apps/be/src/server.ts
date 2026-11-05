// Backend HTTP API for the web app. The browser only talks to this server (docs/api-contract.md §1).
import { createServer } from 'node:http'
import { z } from 'zod'
import { SESSION_COOKIE, createChallenge, login, loginSchema, logout, requireUser } from './auth.ts'
import { config } from './config.ts'
import { newId } from './crypto.ts'
import { migrate, query } from './db.ts'
import { engineFetch, engineJson, skills, templates } from './engine.ts'
import { HttpError, assertSameOrigin, cors, readBody, sendJson, setCookie } from './http.ts'
import { createMind, createMindSchema, deleteMind, listMinds, mindConfig, requireMind, updateMind, updateMindSchema } from './minds.ts'
import { getRun, listRuns, mindEvents, pendingApprovals, relayRun, runEvents } from './runs.ts'
import { deleteSecret, listSecrets, putSecret, putSecretSchema, secretNameSchema, secretsForRun } from './secrets.ts'
import { createWallet, freezeTransaction, getWallet, policySchema, policyTransaction } from './wallets.ts'
import { autopilotSchema, deleteAllWorkflows, deleteAutopilot, putAutopilot, runWorkflowSchema, syncAutopilots, workflowIdSchema, workflowPath } from './workflows.ts'

const chatSchema = z.object({
  // Omit to start a new thread. A given thread must already belong to this Mind (see below).
  threadId: z.string().regex(/^thr_[a-f0-9]{24}$/).optional(),
  message: z.string().min(1).max(16_000),
})
const resumeSchema = z.object({ toolCallId: z.string().min(1).max(200), reason: z.string().max(500).optional() })

const limitOf = (url: URL, fallback: number, max: number) => Math.min(Math.max(Number(url.searchParams.get('limit') ?? fallback) || fallback, 1), max)

// Engine JSON answers go to the browser unchanged (status and body).
const passthrough = (res: Parameters<typeof sendJson>[0], out: { status: number; body: unknown }) =>
  out.status === 204 ? res.writeHead(204).end() : sendJson(res, out.status, out.body)

export const server = createServer(async (req, res) => {
  try {
    cors(req, res)
    if (req.method === 'OPTIONS') return res.writeHead(204).end()
    assertSameOrigin(req)
    const url = new URL(req.url ?? '/', 'http://be')
    const path = url.pathname
    const route = (method: string, pattern: RegExp) => (req.method === method ? path.match(pattern) : null)

    if (route('GET', /^\/v1\/health$/)) {
      const engine = await engineFetch('/v1/health').then((r) => r.ok, () => false)
      return sendJson(res, 200, { ok: true, engine })
    }

    // Auth (#8)
    if (route('POST', /^\/v1\/auth\/challenge$/)) return sendJson(res, 200, await createChallenge())
    if (route('POST', /^\/v1\/auth\/login$/)) {
      const { user, token } = await login(await readBody(req, loginSchema))
      setCookie(res, SESSION_COOKIE, token, config.sessionTtlMs)
      return sendJson(res, 200, { user })
    }
    if (route('POST', /^\/v1\/auth\/logout$/)) {
      await logout(req)
      setCookie(res, SESSION_COOKIE, '', 0)
      return res.writeHead(204).end()
    }

    // Everything below needs a session.
    const user = await requireUser(req)
    if (route('GET', /^\/v1\/me$/)) return sendJson(res, 200, { user })
    if (route('GET', /^\/v1\/templates$/)) return sendJson(res, 200, { templates: await templates() })
    if (route('GET', /^\/v1\/skills$/)) return sendJson(res, 200, { skills: await skills() })

    // Secrets (#18): names and hosts only ever leave the backend, never values.
    if (route('GET', /^\/v1\/secrets$/)) return sendJson(res, 200, { secrets: await listSecrets(user.id) })
    const secret = path.match(/^\/v1\/secrets\/([^/]+)$/)
    if (secret) {
      const name = secretNameSchema.safeParse(decodeURIComponent(secret[1]))
      if (!name.success) throw new HttpError(400, 'invalid_secret_name')
      if (req.method === 'PUT') return sendJson(res, 200, { secret: await putSecret(user.id, name.data, await readBody(req, putSecretSchema)) })
      if (req.method === 'DELETE') return (await deleteSecret(user.id, name.data)) ? res.writeHead(204).end() : sendJson(res, 404, { error: 'not_found' })
      throw new HttpError(405, 'method_not_allowed')
    }

    // Minds (#8, #13)
    if (route('GET', /^\/v1\/minds$/)) return sendJson(res, 200, { minds: await listMinds(user.id) })
    if (route('POST', /^\/v1\/minds$/)) return sendJson(res, 201, { mind: await createMind(user.id, await readBody(req, createMindSchema)) })

    // Runs (#14, #17)
    const run = path.match(/^\/v1\/runs\/([^/]+)(\/approve|\/decline)?$/)
    if (run) {
      const found = await getRun(user.id, decodeURIComponent(run[1]))
      if (!found) throw new HttpError(404, 'run_not_found')
      if (!run[2] && req.method === 'GET') return sendJson(res, 200, { run: found, events: await runEvents(found.runId) })
      if (run[2] && req.method === 'POST') {
        const body = await readBody(req, resumeSchema)
        // Only an action the run is actually waiting for can be approved or declined.
        const [waiting] = await query(
          `select 1 from run_events where run_id = $1 and type = 'tool.approval_required' and payload->>'toolCallId' = $2`, [found.runId, body.toolCallId])
        if (found.status !== 'awaiting_approval' || !waiting) throw new HttpError(409, 'not_awaiting_approval')
        const mind = await requireMind(user.id, found.mindId)
        const engineRes = await engineFetch(`/v1/runs/${encodeURIComponent(found.runId)}${run[2]}?mindId=${encodeURIComponent(mind.id)}`, {
          method: 'POST',
          body: { userId: user.id, threadId: found.threadId, mind: mindConfig(mind), secrets: await secretsForRun(user.id), toolCallId: body.toolCallId, reason: body.reason },
        })
        return relayRun(req, res, engineRes, { mindId: mind.id, threadId: found.threadId ?? undefined, resumeOf: found.runId })
      }
      throw new HttpError(405, 'method_not_allowed')
    }

    const m = path.match(/^\/v1\/minds\/([^/]+)(\/.*)?$/)
    if (m) {
      const mind = await requireMind(user.id, decodeURIComponent(m[1]))
      const sub = m[2] ?? ''

      // The Mind's OutLayer wallet (#14, #15). Owner actions come back as transactions for the owner to sign.
      if (sub === '/wallet' && req.method === 'POST') return sendJson(res, 201, { wallet: await createWallet(mind.id) })
      if (sub === '/wallet' && req.method === 'GET') return sendJson(res, 200, { wallet: await getWallet(mind.id) })
      if (sub === '/wallet/policy' && req.method === 'POST') return sendJson(res, 200, { transaction: await policyTransaction(mind.id, user.nearAccountId, await readBody(req, policySchema)) })
      if ((sub === '/wallet/freeze' || sub === '/wallet/unfreeze') && req.method === 'POST') return sendJson(res, 200, { transaction: await freezeTransaction(mind.id, sub === '/wallet/freeze') })
      if (sub.startsWith('/wallet')) throw new HttpError(req.method === 'GET' || req.method === 'POST' ? 404 : 405, req.method === 'GET' || req.method === 'POST' ? 'not_found' : 'method_not_allowed')

      if (sub === '' && req.method === 'GET') return sendJson(res, 200, { mind })
      if (sub === '' && req.method === 'PATCH') {
        const updated = await updateMind(user.id, mind.id, await readBody(req, updateMindSchema))
        return sendJson(res, 200, { mind: updated, autopilot: await syncAutopilots(user.id, updated) })
      }
      if (sub === '' && req.method === 'DELETE') {
        await deleteAllWorkflows(mind.id)
        await deleteMind(user.id, mind.id)
        return res.writeHead(204).end()
      }

      if (sub === '/chat' && req.method === 'POST') {
        const body = await readBody(req, chatSchema)
        // Engine memory is keyed by thread id, so a thread id from another Mind (or user) must never pass.
        if (body.threadId && !(await query('select 1 from runs where mind_id = $1 and thread_id = $2 limit 1', [mind.id, body.threadId])).length) {
          throw new HttpError(404, 'thread_not_found')
        }
        const threadId = body.threadId ?? `thr_${newId('x').slice(2)}`
        const engineRes = await engineFetch(`/v1/minds/${encodeURIComponent(mind.id)}/chat`, {
          method: 'POST',
          body: { userId: user.id, threadId, message: body.message, mind: mindConfig(mind), secrets: await secretsForRun(user.id) },
        })
        return relayRun(req, res, engineRes, { mindId: mind.id, threadId })
      }
      if (sub === '/runs' && req.method === 'GET') {
        return sendJson(res, 200, { runs: await listRuns(mind.id, limitOf(url, 20, 100), url.searchParams.get('threadId') ?? undefined) })
      }
      if (sub === '/events' && req.method === 'GET') {
        const since = new Date(url.searchParams.get('since') ?? Date.now() - 7 * 24 * 60 * 60 * 1000)
        if (Number.isNaN(since.getTime())) throw new HttpError(400, 'invalid_since')
        return sendJson(res, 200, { events: await mindEvents(mind.id, since, limitOf(url, 2000, 10_000)) })
      }
      if (sub === '/approvals' && req.method === 'GET') return sendJson(res, 200, { approvals: await pendingApprovals(mind.id) })

      // Visual Builder (#20) and Autopilot (#21)
      if (sub === '/workflows' && req.method === 'GET') return passthrough(res, await engineJson(workflowPath(mind.id)))
      const wf = sub.match(/^\/workflows\/([^/]+)(\/runs|\/autopilot)?$/)
      if (wf) {
        const id = workflowIdSchema.safeParse(decodeURIComponent(wf[1]))
        if (!id.success) throw new HttpError(400, 'invalid_id')
        const p = `${workflowPath(mind.id)}/${id.data}`
        if (!wf[2] && req.method === 'GET') return passthrough(res, await engineJson(p))
        if (!wf[2] && req.method === 'PUT') return passthrough(res, await engineJson(p, { method: 'PUT', body: await readBody(req, z.unknown()) }))
        if (!wf[2] && req.method === 'DELETE') {
          const out = await engineJson(p, { method: 'DELETE' })
          if (out.status === 204) await query('delete from autopilots where mind_id = $1 and workflow_id = $2', [mind.id, id.data])
          return passthrough(res, out)
        }
        if (wf[2] === '/runs' && req.method === 'POST') {
          const body = await readBody(req, runWorkflowSchema)
          const engineRes = await engineFetch(`${p}/runs`, { method: 'POST', body: { userId: user.id, mind: mindConfig(mind), secrets: await secretsForRun(user.id), input: body.input } })
          return relayRun(req, res, engineRes, { mindId: mind.id, workflowId: id.data })
        }
        if (wf[2] === '/runs' && req.method === 'GET') return passthrough(res, await engineJson(`${p}/runs?limit=${limitOf(url, 20, 100)}`))
        if (wf[2] === '/autopilot' && req.method === 'GET') return passthrough(res, await engineJson(`${p}/autopilot`))
        if (wf[2] === '/autopilot' && req.method === 'PUT') return passthrough(res, await putAutopilot(user.id, mind, id.data, await readBody(req, autopilotSchema)))
        if (wf[2] === '/autopilot' && req.method === 'DELETE') return passthrough(res, await deleteAutopilot(mind.id, id.data))
      }
      throw new HttpError(405, 'method_not_allowed')
    }

    return sendJson(res, 404, { error: 'not_found' })
  } catch (e) {
    if (res.headersSent) return void res.end()
    if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message, ...e.extra })
    console.error('unhandled', e instanceof Error ? e.message : e)
    sendJson(res, 500, { error: 'internal_error' })
  }
})

if (import.meta.url === `file://${process.argv[1]}`) {
  const applied = await migrate()
  if (applied.length) console.log('migrations applied', applied.join(', '))
  server.listen(config.port, () => console.log(`backend listening on :${config.port}`))
}
