// Backend HTTP API for the web app. The browser only talks to this server (docs/api-contract.md §1).
import { createServer } from 'node:http'
import { z } from 'zod'
import { SESSION_COOKIE, createChallenge, login, loginSchema, logout, requireUser } from './auth.ts'
import { config } from './config.ts'
import { newId } from './crypto.ts'
import { migrate, query } from './db.ts'
import { engineFetch, engineJson, skills, templates } from './engine.ts'
import { HttpError, assertSameOrigin, cors, logServerError, readBody, sendJson, setCookie, isLoopback } from './http.ts'
import { TOOLKITS, connect, disconnect, listConnections, toolkitSchema } from './connections.ts'
import { createMind, createMindSchema, deleteMind, listMinds, mindConfig, playgroundAttackOf, playgroundMind, requireMind, updateMind, updateMindSchema, type Mind } from './minds.ts'
import { cancelRun, getRun, listRuns, mindEvents, pendingApprovals, relayRun, runEvents } from './runs.ts'
import { deleteSecret, listSecrets, putSecret, putSecretSchema, secretNameSchema, secretsForRun } from './secrets.ts'
import { createWallet, freezeTransaction, getWallet, hasWallet, isDemoMind, policySchema, policyTransaction } from './wallets.ts'
import { listPayments, sendPayment, sendPaymentSchema, walletBalance } from './payments.ts'
import { itemSchema, shop, txHashSchema } from './shop.ts'
import { issueMailToken, issueWalletToken, verifyMailToken, verifyWalletToken } from './walletToken.ts'
import { EMAIL_SKILL, ensureInbox, inboxOf, listMail, listSends, mailEnabled, messageIdSchema, ownerMailSchema, readMail, releaseInbox, sendMail, sendMailSchema, sendMailToOwner } from './mail.ts'
import { listThreads, parseCursor, threadExists, threadMessages } from './threads.ts'
import { assertDemoRunAllowed, cleanupDemoUsers, createDemoUser, demoPaymentCap, denyDemo } from './demo.ts'
import type { User } from './auth.ts'
import { timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { autopilotSchema, deleteAllWorkflows, deleteAutopilot, putAutopilot, runWorkflowSchema, syncAutopilots, workflowIdSchema, workflowPath } from './workflows.ts'

// The commit this release was deployed from: deploy/deploy.sh writes REVISION at the release root. null when run from a checkout.
const REVISION = (() => {
  try {
    return readFileSync(new URL('../../../REVISION', import.meta.url), 'utf8').trim() || null
  } catch {
    return null
  }
})()

// The owner's IANA time zone from the browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`, e.g.
// `Asia/Jakarta`), passed on to the engine so a Mind knows the owner's local date and weekday (#112). Optional on
// every run request; a name the runtime does not know is a 400, never forwarded.
const isTimeZone = (tz: string) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false } }
const timeZoneSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_+\-/]+$/).refine(isTimeZone, 'unknown time zone')
const chatSchema = z.object({
  // Omit to start a new thread. A given thread must already belong to this Mind (see below).
  threadId: z.string().regex(/^thr_[a-f0-9]{24}$/).optional(),
  message: z.string().min(1).max(16_000),
  timeZone: timeZoneSchema.optional(),
})
const resumeSchema = z.object({ toolCallId: z.string().min(1).max(200), reason: z.string().max(500).optional(), timeZone: timeZoneSchema.optional() })
const attackRunSchema = z.object({ timeZone: timeZoneSchema.optional() })
const attackIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/)
type Attack = { attackId: string; title: string; templateId: string; skills: string[]; message: string }
const runSchema = runWorkflowSchema.extend({ timeZone: timeZoneSchema.optional() })
const timeZoneOf = (body: { timeZone?: string }) => (body.timeZone ? { timeZone: body.timeZone } : {})
const attackOf = (attackId: string | null) => (attackId ? { attackId } : {})

const limitOf = (url: URL, fallback: number, max: number) => Math.min(Math.max(Number(url.searchParams.get('limit') ?? fallback) || fallback, 1), max)

// Engine JSON answers go to the browser unchanged (status and body).
const passthrough = (res: Parameters<typeof sendJson>[0], out: { status: number; body: unknown }) =>
  out.status === 204 ? res.writeHead(204).end() : sendJson(res, out.status, out.body)

// Extra fields for one engine call: the wallet token (#42) only for a Mind that has a wallet, the mail token (#96) only
// for a Mind with the email-address skill and an inbox, and `demo: true` for a judge try-out user (#43) or an Attack
// Playground Mind (#129), so the engine uses the sample inbox and calendar. Autopilot gets none of them.
const runExtras = async (user: User, mindId: string) => ({
  ...((await hasWallet(mindId)) ? { walletToken: issueWalletToken(user.id, mindId) } : {}),
  ...((await mailEnabled(mindId)) ? { mailToken: issueMailToken(user.id, mindId) } : {}),
  ...(user.demo || (await playgroundAttackOf(mindId)) ? { demo: true } : {}),
})

// A playground run (#129) never gets the owner's secrets: the scenarios are prompt injections.
const secretsFor = async (userId: string, mindId: string) => ((await playgroundAttackOf(mindId)) ? [] : secretsForRun(userId))

// An owner's Mind gets its inbox when it equips the email-address skill (#96). The skills are saved either way; a
// failure (AgentMail down, organization full) comes back as `inboxError` and POST …/inbox retries it.
async function withInbox(user: User, mind: Mind): Promise<{ mind: Mind; inboxError?: Record<string, unknown> }> {
  if (user.demo || mind.email || !mind.skills.includes(EMAIL_SKILL)) return { mind }
  try {
    const { inbox } = await ensureInbox(mind.id)
    return { mind: { ...mind, email: inbox.email } }
  } catch (e) {
    if (!(e instanceof HttpError)) throw e
    if (e.status >= 500) logServerError({ url: `/v1/minds/${mind.id}/inbox`, method: 'POST' } as never, e.status, e.message, e.extra)
    return { mind, inboxError: { error: e.message, ...e.extra } }
  }
}

const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

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
      return sendJson(res, 200, { ok: true, engine, revision: REVISION })
    }

    // Auth (#8)
    if (route('POST', /^\/v1\/auth\/challenge$/)) return sendJson(res, 200, await createChallenge())
    if (route('POST', /^\/v1\/auth\/login$/)) {
      const { user, token } = await login(await readBody(req, loginSchema))
      setCookie(res, SESSION_COOKIE, token, config.sessionTtlMs)
      return sendJson(res, 200, { user })
    }
    if (route('POST', /^\/v1\/auth\/demo$/)) {
      const { user, token } = await createDemoUser(req)
      setCookie(res, SESSION_COOKIE, token, config.sessionTtlMs)
      return sendJson(res, 201, { user })
    }
    if (route('POST', /^\/v1\/auth\/logout$/)) {
      await logout(req)
      setCookie(res, SESSION_COOKIE, '', 0)
      return res.writeHead(204).end()
    }

    // Internal routes for the engine's payment tools (#42, option B): loopback only (the engine runs next to the
    // backend; anything through the tunnel gets 404), then engine key + wallet token, no session.
    if (path.startsWith('/internal/') && !isLoopback(req.socket.remoteAddress)) throw new HttpError(404, 'not_found')
    const internal = path.match(/^\/internal\/v1\/wallet\/(send_payment|balance|payments)$/)
    if (internal) {
      if (!sameSecret(String(req.headers['x-engine-key'] ?? ''), config.engineApiKey)) throw new HttpError(401, 'unauthorized')
      const { userId, mindId } = verifyWalletToken(req.headers['x-wallet-token'] as string | undefined)
      await requireMind(userId, mindId)
      if (internal[1] === 'send_payment' && req.method === 'POST') {
        // The shared demo wallet (a try-out user's or a playground Mind, #129) keeps the per-user payment cap.
        return sendJson(res, 200, await sendPayment(mindId, await readBody(req, sendPaymentSchema), { cap: (await isDemoMind(mindId)) ? demoPaymentCap(userId) : undefined }))
      }
      if (internal[1] === 'balance' && req.method === 'GET') return sendJson(res, 200, await walletBalance(mindId))
      if (internal[1] === 'payments' && req.method === 'GET') return sendJson(res, 200, { payments: await listPayments(mindId, limitOf(url, 20, 100)) })
      throw new HttpError(405, 'method_not_allowed')
    }
    // Paid data (#150): the engine's buy_data tool, with the run's wallet token (the Mind pays from its own wallet).
    const shopPath = path.match(/^\/internal\/v1\/shop\/([^/]+)$/)
    if (shopPath) {
      if (!sameSecret(String(req.headers['x-engine-key'] ?? ''), config.engineApiKey)) throw new HttpError(401, 'unauthorized')
      const { userId, mindId } = verifyWalletToken(req.headers['x-wallet-token'] as string | undefined)
      await requireMind(userId, mindId)
      if (req.method !== 'GET') throw new HttpError(405, 'method_not_allowed')
      const item = itemSchema.safeParse(decodeURIComponent(shopPath[1]))
      if (!item.success) throw new HttpError(404, 'unknown_item')
      const tx = url.searchParams.get('tx')
      if (tx !== null && !txHashSchema.safeParse(tx).success) throw new HttpError(400, 'invalid_tx_hash')
      const out = await shop(mindId, item.data, tx ?? undefined)
      return sendJson(res, out.httpStatus, out.body)
    }
    // Autopilot's "Email me" (#146): engine key only, since a scheduled run carries no run token; the recipient is
    // decided here (the owner's Gmail address), never by the engine.
    if (path === '/internal/v1/mail/owner') {
      if (!sameSecret(String(req.headers['x-engine-key'] ?? ''), config.engineApiKey)) throw new HttpError(401, 'unauthorized')
      if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
      const body = await readBody(req, ownerMailSchema)
      await requireMind(body.userId, body.mindId)
      return sendJson(res, 200, await sendMailToOwner(body))
    }
    // The mail tools (#96): same three checks, with a mail token that names the run's Mind.
    const mail = path.match(/^\/internal\/v1\/mail\/(send|messages)(?:\/([^/]+))?$/)
    if (mail) {
      if (!sameSecret(String(req.headers['x-engine-key'] ?? ''), config.engineApiKey)) throw new HttpError(401, 'unauthorized')
      const { userId, mindId } = verifyMailToken(req.headers['x-mail-token'] as string | undefined)
      await requireMind(userId, mindId)
      if (mail[1] === 'send' && !mail[2] && req.method === 'POST') {
        const [owner] = await query<{ is_demo: boolean }>('select is_demo from users where id = $1', [userId])
        return sendJson(res, 200, await sendMail(mindId, await readBody(req, sendMailSchema), { cap: owner?.is_demo ? { userId, max: config.demo.mailPerUser } : undefined }))
      }
      if (mail[1] === 'messages' && !mail[2] && req.method === 'GET') return sendJson(res, 200, await listMail(mindId, limitOf(url, 10, 25)))
      if (mail[1] === 'messages' && mail[2] && req.method === 'GET') {
        const id = messageIdSchema.safeParse(decodeURIComponent(mail[2]))
        if (!id.success) throw new HttpError(400, 'invalid_message_id')
        return sendJson(res, 200, await readMail(mindId, id.data))
      }
      throw new HttpError(405, 'method_not_allowed')
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
      if (req.method === 'PUT') denyDemo(user, 'secrets')
      if (req.method === 'PUT') return sendJson(res, 200, { secret: await putSecret(user.id, name.data, await readBody(req, putSecretSchema)) })
      if (req.method === 'DELETE') return (await deleteSecret(user.id, name.data)) ? res.writeHead(204).end() : sendJson(res, 404, { error: 'not_found' })
      throw new HttpError(405, 'method_not_allowed')
    }

    // App connections through Composio (#13): status and Connect Links only, never tokens.
    if (route('GET', /^\/v1\/connections$/)) return sendJson(res, 200, { connections: await listConnections(user.id) })
    const connection = path.match(/^\/v1\/connections\/([^/]+)$/)
    if (connection) {
      const toolkit = toolkitSchema.safeParse(decodeURIComponent(connection[1]))
      if (!toolkit.success) throw new HttpError(404, 'unknown_toolkit', { toolkits: TOOLKITS })
      if (req.method === 'POST') return sendJson(res, 200, await connect(user.id, toolkit.data))
      if (req.method === 'DELETE') return (await disconnect(user.id, toolkit.data)) ? res.writeHead(204).end() : sendJson(res, 404, { error: 'not_found' })
      throw new HttpError(405, 'method_not_allowed')
    }

    // Minds (#8, #13)
    if (route('GET', /^\/v1\/minds$/)) return sendJson(res, 200, { minds: await listMinds(user.id) })
    if (route('POST', /^\/v1\/minds$/)) return sendJson(res, 201, await withInbox(user, await createMind(user.id, await readBody(req, createMindSchema))))

    // Attack Playground (#129): the engine's scenarios, each run on the user's playground Mind for it.
    if (route('GET', /^\/v1\/attacks$/)) return passthrough(res, await engineJson('/v1/attacks'))
    const attackRun = path.match(/^\/v1\/attacks\/([^/]+)\/runs$/)
    if (attackRun && req.method === 'POST') {
      const id = attackIdSchema.safeParse(decodeURIComponent(attackRun[1]))
      const body = await readBody(req, attackRunSchema)
      const listed = await engineJson('/v1/attacks')
      const attack = id.success && listed.status === 200 ? ((listed.body as { attacks: Attack[] }).attacks ?? []).find((a) => a.attackId === id.data) : undefined
      if (!attack) {
        if (listed.status !== 200) return passthrough(res, listed)
        throw new HttpError(404, 'unknown_attack')
      }
      const mind = await playgroundMind(user.id, attack)
      await assertDemoRunAllowed(user, req)
      const threadId = `thr_${newId('x').slice(2)}`
      // Stop (#121) works on attack runs too.
      const controller = new AbortController()
      const engineRes = await engineFetch(`/v1/minds/${encodeURIComponent(mind.id)}/chat`, {
        method: 'POST', signal: controller.signal,
        body: { userId: user.id, threadId, message: attack.message, mind: mindConfig(mind), secrets: [], attackId: attack.attackId, ...timeZoneOf(body), ...(await runExtras(user, mind.id)) },
      })
      return relayRun(req, res, engineRes, { mindId: mind.id, threadId, userMessage: attack.message, controller })
    }

    // Runs (#14, #17)
    const run = path.match(/^\/v1\/runs\/([^/]+)(\/approve|\/decline|\/cancel)?$/)
    if (run) {
      const found = await getRun(user.id, decodeURIComponent(run[1]))
      if (!found) throw new HttpError(404, 'run_not_found')
      if (!run[2] && req.method === 'GET') return sendJson(res, 200, { run: found, events: await runEvents(found.runId) })
      // Stop a run that is still streaming (#121). A run paused for approval has no stream: decline it instead.
      if (run[2] === '/cancel' && req.method === 'POST') {
        const stopped = cancelRun(found.runId)
        if (!stopped) throw new HttpError(409, 'not_running', { status: found.status })
        await stopped
        return sendJson(res, 200, { run: await getRun(user.id, found.runId) })
      }
      if (run[2] && req.method === 'POST') {
        const body = await readBody(req, resumeSchema)
        // Only an action the run is actually waiting for can be approved or declined.
        const [waiting] = await query(
          `select 1 from run_events where run_id = $1 and type = 'tool.approval_required' and payload->>'toolCallId' = $2`, [found.runId, body.toolCallId])
        if (found.status !== 'awaiting_approval' || !waiting) throw new HttpError(409, 'not_awaiting_approval')
        const mind = await requireMind(user.id, found.mindId)
        await assertDemoRunAllowed(user, req)
        const controller = new AbortController()
        const engineRes = await engineFetch(`/v1/runs/${encodeURIComponent(found.runId)}${run[2]}?mindId=${encodeURIComponent(mind.id)}`, {
          method: 'POST', signal: controller.signal,
          body: {
            userId: user.id, threadId: found.threadId, mind: mindConfig(mind), secrets: await secretsFor(user.id, mind.id), toolCallId: body.toolCallId, reason: body.reason,
            ...timeZoneOf(body), ...(await runExtras(user, mind.id)), ...attackOf(await playgroundAttackOf(mind.id)),
          },
        })
        return relayRun(req, res, engineRes, { mindId: mind.id, threadId: found.threadId ?? undefined, resumeOf: found.runId, controller })
      }
      throw new HttpError(405, 'method_not_allowed')
    }

    const m = path.match(/^\/v1\/minds\/([^/]+)(\/.*)?$/)
    if (m) {
      const mind = await requireMind(user.id, decodeURIComponent(m[1]))
      // A playground Mind (#129) is reached only through /v1/attacks and its runs, never as one of the owner's.
      if (await playgroundAttackOf(mind.id)) throw new HttpError(404, 'mind_not_found')
      const sub = m[2] ?? ''

      // The Mind's OutLayer wallet (#14, #15). Owner actions come back as transactions for the owner to sign.
      if (sub === '/wallet' && req.method === 'POST') denyDemo(user, 'create_wallet')
      if (sub === '/wallet' && req.method === 'POST') return sendJson(res, 201, { wallet: await createWallet(mind.id) })
      if (sub === '/wallet' && req.method === 'GET') return sendJson(res, 200, { wallet: await getWallet(mind.id) })
      if (sub === '/wallet/payments' && req.method === 'GET') return sendJson(res, 200, { payments: await listPayments(mind.id, limitOf(url, 20, 100)) })
      if (sub === '/wallet/policy' && req.method === 'POST') denyDemo(user, 'set_policy')
      if (sub === '/wallet/policy' && req.method === 'POST') return sendJson(res, 200, { transaction: await policyTransaction(mind.id, user.nearAccountId, await readBody(req, policySchema)) })
      if ((sub === '/wallet/freeze' || sub === '/wallet/unfreeze') && req.method === 'POST') denyDemo(user, 'freeze')
      if ((sub === '/wallet/freeze' || sub === '/wallet/unfreeze') && req.method === 'POST') return sendJson(res, 200, { transaction: await freezeTransaction(mind.id, sub === '/wallet/freeze') })
      if (sub.startsWith('/wallet')) throw new HttpError(req.method === 'GET' || req.method === 'POST' ? 404 : 405, req.method === 'GET' || req.method === 'POST' ? 'not_found' : 'method_not_allowed')

      // The Mind's email address (#96). POST creates the inbox (idempotent) for a Mind that equips email-address.
      if (sub === '/inbox' && req.method === 'GET') {
        const inbox = await inboxOf(mind.id)
        return sendJson(res, 200, { inbox: inbox ? { email: inbox.email, shared: inbox.shared } : null })
      }
      if (sub === '/inbox' && req.method === 'POST') {
        denyDemo(user, 'create_inbox')
        if (!mind.skills.includes(EMAIL_SKILL)) throw new HttpError(409, 'email_skill_off', { skill: EMAIL_SKILL })
        const { inbox, created } = await ensureInbox(mind.id)
        return sendJson(res, created ? 201 : 200, { inbox: { email: inbox.email, shared: false } })
      }
      if (sub === '/mail/sent' && req.method === 'GET') return sendJson(res, 200, { sends: await listSends(mind.id, limitOf(url, 20, 100)) })

      if (sub === '' && req.method === 'GET') return sendJson(res, 200, { mind })
      if (sub === '' && req.method === 'PATCH') {
        const { mind: updated, inboxError } = await withInbox(user, await updateMind(user.id, mind.id, await readBody(req, updateMindSchema)))
        return sendJson(res, 200, { mind: updated, autopilot: await syncAutopilots(user.id, updated), ...(inboxError ? { inboxError } : {}) })
      }
      if (sub === '' && req.method === 'DELETE') {
        await deleteAllWorkflows(mind.id)
        await releaseInbox(mind.id)
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
        await assertDemoRunAllowed(user, req)
        const controller = new AbortController()
        const engineRes = await engineFetch(`/v1/minds/${encodeURIComponent(mind.id)}/chat`, {
          method: 'POST', signal: controller.signal,
          body: { userId: user.id, threadId, message: body.message, mind: mindConfig(mind), secrets: await secretsForRun(user.id), ...timeZoneOf(body), ...(await runExtras(user, mind.id)) },
        })
        return relayRun(req, res, engineRes, { mindId: mind.id, threadId, userMessage: body.message, controller })
      }
      if (sub === '/runs' && req.method === 'GET') {
        return sendJson(res, 200, { runs: await listRuns(mind.id, limitOf(url, 20, 100), url.searchParams.get('threadId') ?? undefined) })
      }
      if (sub === '/events' && req.method === 'GET') {
        const since = new Date(url.searchParams.get('since') ?? Date.now() - 7 * 24 * 60 * 60 * 1000)
        if (Number.isNaN(since.getTime())) throw new HttpError(400, 'invalid_since')
        return sendJson(res, 200, { events: await mindEvents(mind.id, since, limitOf(url, 2000, 10_000)) })
      }
      // Chat threads (#54)
      if (sub === '/threads' && req.method === 'GET') return sendJson(res, 200, { threads: await listThreads(mind.id, limitOf(url, 20, 100)) })
      const thread = sub.match(/^\/threads\/(thr_[a-f0-9]{24})\/messages$/)
      if (thread && req.method === 'GET') {
        if (!(await threadExists(mind.id, thread[1]))) throw new HttpError(404, 'thread_not_found')
        const raw = url.searchParams.get('before')
        const before = raw === null ? undefined : parseCursor(raw)
        if (before === null) throw new HttpError(400, 'invalid_before')
        return sendJson(res, 200, await threadMessages(mind.id, thread[1], limitOf(url, 50, 200), before))
      }
      if (sub.startsWith('/threads')) throw new HttpError(req.method === 'GET' ? 404 : 405, req.method === 'GET' ? 'thread_not_found' : 'method_not_allowed')
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
          const body = await readBody(req, runSchema)
          await assertDemoRunAllowed(user, req)
          const controller = new AbortController()
          const engineRes = await engineFetch(`${p}/runs`, { method: 'POST', signal: controller.signal, body: { userId: user.id, mind: mindConfig(mind), secrets: await secretsForRun(user.id), input: body.input, ...timeZoneOf(body), ...(await runExtras(user, mind.id)) } })
          return relayRun(req, res, engineRes, { mindId: mind.id, workflowId: id.data, controller })
        }
        if (wf[2] === '/runs' && req.method === 'GET') return passthrough(res, await engineJson(`${p}/runs?limit=${limitOf(url, 20, 100)}`))
        if (wf[2] === '/autopilot' && req.method === 'GET') return passthrough(res, await engineJson(`${p}/autopilot`))
        if (wf[2] === '/autopilot' && req.method === 'PUT') denyDemo(user, 'autopilot')
        if (wf[2] === '/autopilot' && req.method === 'PUT') return passthrough(res, await putAutopilot(user.id, mind, id.data, await readBody(req, autopilotSchema)))
        if (wf[2] === '/autopilot' && req.method === 'DELETE') return passthrough(res, await deleteAutopilot(mind.id, id.data))
      }
      throw new HttpError(405, 'method_not_allowed')
    }

    return sendJson(res, 404, { error: 'not_found' })
  } catch (e) {
    if (res.headersSent) return void res.end()
    if (e instanceof HttpError) {
      if (e.status >= 500) logServerError(req, e.status, e.message, e.extra)
      return sendJson(res, e.status, { error: e.message, ...e.extra })
    }
    logServerError(req, 500, 'internal_error', { message: e instanceof Error ? e.message : String(e) })
    sendJson(res, 500, { error: 'internal_error' })
  }
})

if (import.meta.url === `file://${process.argv[1]}`) {
  const applied = await migrate()
  if (applied.length) console.log('migrations applied', applied.join(', '))
  server.listen(config.port, () => console.log(`backend listening on :${config.port}`))
  // Judge try-out users are deleted after the retention: at start and once a day.
  const sweep = () => cleanupDemoUsers(async (mindId) => { await deleteAllWorkflows(mindId) }).then((n) => { if (n) console.log('demo users removed', n) }, (e) => console.error('demo cleanup failed', e instanceof Error ? e.message : e))
  void sweep()
  setInterval(sweep, 24 * 3600_000).unref()
}
