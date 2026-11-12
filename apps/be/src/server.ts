// Backend HTTP API for the web app. The browser only talks to this server (docs/api-contract.md §1).
import { createServer } from 'node:http'
import { z } from 'zod'
import { SESSION_COOKIE, createChallenge, login, loginSchema, logout, requireUser } from './auth.ts'
import { config } from './config.ts'
import { newId, sameSecret } from './crypto.ts'
import { migrate, query } from './db.ts'
import { engineFetch, engineJson, skill, skills, templates } from './engine.ts'
import { HttpError, assertSameOrigin, cors, logServerError, readBody, sendJson, setCookie, isLoopback } from './http.ts'
import { TOOLKITS, connect, disconnect, listConnections, toolkitSchema } from './connections.ts'
import { createMind, createMindSchema, deleteMind, listMinds, mindConfig, playgroundAttackOf, playgroundMind, requireMind, updateMind, updateMindSchema, type Mind } from './minds.ts'
import { cancelRun, getRun, isAwaiting, listRuns, mindEvents, pendingApprovals, relayRun, runEvents, runProofs, sweepStuckRuns } from './runs.ts'
import { explorerReport, quotesOf } from './teeExplorer.ts'
import { relay } from './relay.ts'
import { deleteSecret, listSecrets, putSecret, putSecretSchema, secretNameSchema, secretsForRun } from './secrets.ts'
import { addressRuleOf, assertWalletEmpty, createWallet, freezeTransaction, getWallet, hasWallet, isDemoMind, policySchema, policyTransaction } from './wallets.ts'
import { listPayments, paymentsCsv, sendPayment, sendPaymentSchema, walletBalance } from './payments.ts'
import { itemSchema, offerNearSchema, sellerSchema, shop, txHashSchema } from './shop.ts'
import { buyOffer, offerItemSchema, putOffer, putOfferSchema } from './offers.ts'
import { issueMailToken, issueWalletToken, verifyMailToken, verifyWalletToken } from './walletToken.ts'
import { EMAIL_SKILL, ensureInbox, inboxOf, listMail, listSends, mailEnabled, messageIdSchema, ownerMailSchema, readMail, releaseInbox, sendMail, sendMailSchema, sendMailToOwner } from './mail.ts'
import { deleteThread, listThreads, parseCursor, renameThread, sweepDeletedThreads, threadExists, threadMessages, threadTitleSchema } from './threads.ts'
import { connectTelegram, disconnectTelegram, outcomeOf, registerTelegramWebhooks, startTelegramPolling, telegramStatus, telegramTokenSchema, telegramWebhook, type MindRunner } from './telegram.ts'
import { assertDemoRunAllowed, cleanupDemoUsers, createDemoUser, demoPaymentCap, denyDemo } from './demo.ts'
import type { User } from './auth.ts'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
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
// The owner's edit of what a Mind remembers (#209); the engine has the same 20,000-character cap.
const memoryWriteSchema = z.object({ markdown: z.string().max(20_000) })
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

// The Mind config for an owner's chat run (#167): a payment rule only covers the wallet policy's listed accounts, read
// here per run, so a list changed in Meteor counts at once. No list (no wallet, no whitelist, OutLayer unreachable)
// leaves `recipients` empty, and every payment asks. Try-outs and playground Minds never get rules.
async function runMindConfig(user: User, mind: Mind) {
  const config = mindConfig(mind)
  if (!config.autoApprove) return config
  if (user.demo || (await playgroundAttackOf(mind.id))) return { ...config, autoApprove: undefined }
  if (!config.autoApprove.payment || !(await hasWallet(mind.id))) return config
  const rule = await addressRuleOf(mind.id).catch(() => null)
  const recipients = rule?.mode === 'whitelist' ? rule.list.slice(0, 20) : []
  return { ...config, autoApprove: { ...config.autoApprove, payment: { ...config.autoApprove.payment, recipients } } }
}

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


// Approve or decline what a paused run waits for, through the engine. The app's route and Telegram's buttons (#208) both
// come here, so both get the same checks and the same resume. Only a call of the current pause counts (`isAwaiting`).
// The run is then claimed (awaiting_approval → running in one update), so two answers at once (the app and Telegram, or
// a double press) resume it once; the second gets 409. If the engine does not take the resume, the claim is undone.
async function resumeRun(user: User, found: { runId: string; mindId: string; threadId: string | null }, action: 'approve' | 'decline', body: z.infer<typeof resumeSchema>, req: IncomingMessage, res: ServerResponse) {
  if (!(await isAwaiting(found.runId, body.toolCallId))) throw new HttpError(409, 'not_awaiting_approval')
  const mind = await requireMind(user.id, found.mindId)
  await assertDemoRunAllowed(user, req)
  const claimed = await query(`update runs set status = 'running' where id = $1 and status = 'awaiting_approval' returning 1`, [found.runId])
  if (!claimed.length) throw new HttpError(409, 'not_awaiting_approval')
  const release = () => query(`update runs set status = 'awaiting_approval' where id = $1 and status = 'running'`, [found.runId])
  const controller = new AbortController()
  let engineRes: Response
  try {
    engineRes = await engineFetch(`/v1/runs/${encodeURIComponent(found.runId)}/${action}?mindId=${encodeURIComponent(mind.id)}`, {
      method: 'POST', signal: controller.signal,
      body: {
        userId: user.id, threadId: found.threadId, mind: await runMindConfig(user, mind), secrets: await secretsFor(user.id, mind.id), toolCallId: body.toolCallId, reason: body.reason,
        ...timeZoneOf(body), ...(await runExtras(user, mind.id)), ...attackOf(await playgroundAttackOf(mind.id)),
      },
    })
  } catch (e) {
    await release()
    throw e
  }
  if (engineRes.status !== 200) await release()
  return relayRun(req, res, engineRes, { mindId: mind.id, threadId: found.threadId ?? undefined, resumeOf: found.runId, controller })
}

// Telegram runs (#168, #208) go through the same code as the app's, relayed into an in-memory sink instead of a browser,
// then read back as text (`outcomeOf`). Same owner, Mind config, secrets, tokens and try-out limits as the app.
// No time zone: Telegram doesn't send one, so runs are in UTC.
async function telegramOwner(mindId: string): Promise<User | null> {
  const [owner] = await query<{ id: string; near_account_id: string; is_demo: boolean }>('select u.id, u.near_account_id, u.is_demo from minds m join users u on u.id = m.user_id where m.id = $1', [mindId])
  return owner ? { id: owner.id, nearAccountId: owner.near_account_id, demo: owner.is_demo } : null
}
// Telegram runs have no client IP: key the try-out hourly window per user, so one busy bot can't use up everyone's
// (Lin1er's review on #171). The per-user run cap still applies.
const telegramReq = (user: User, mindId: string) =>
  Object.assign(new EventEmitter(), { headers: { 'cf-connecting-ip': `telegram:${user.id}` }, socket: { remoteAddress: 'telegram' }, url: `/v1/telegram/${mindId}`, method: 'POST' }) as unknown as IncomingMessage
// `onEvent` (#222) sees each relayed event as it is written, so Telegram can show the reply while the run goes on; the
// relay itself (storage, threads, live view) is the same as for the app.
function memorySink(onEvent?: (e: Record<string, any>) => void) {
  const out = { raw: '', status: 200 }
  let partial = ''
  const take = (t: string) => {
    out.raw += t
    if (!onEvent) return
    const lines = (partial + t).split('\n')
    partial = lines.pop() ?? ''
    for (const l of lines) {
      if (!l.startsWith('data: ')) continue
      let e: Record<string, any> | null = null
      try { e = JSON.parse(l.slice(6)) } catch { /* not an event */ }
      if (e) { try { onEvent(e) } catch { /* the relay must go on */ } }
    }
  }
  const res = {
    writeHead(code: number) { out.status = code; return res },
    write(t: string) { take(t); return true },
    end(t?: string) { if (t) take(t); return res },
  }
  return { out, res: res as unknown as ServerResponse }
}
const failedRun = (threadId: string, error: string) => ({ threadId, text: '', asked: [], outcomes: [], error })

// One owner message, run like a chat from the app.
export const runTelegramChat: MindRunner['chat'] = async (mindId, threadId, text, onEvent) => {
  const thread = threadId ?? `thr_${newId('x').slice(2)}`
  const user = await telegramOwner(mindId)
  if (!user) return failedRun(thread, 'mind_not_found')
  const mind = await requireMind(user.id, mindId)
  const fakeReq = telegramReq(user, mindId)
  try {
    await assertDemoRunAllowed(user, fakeReq)
  } catch (e) {
    return failedRun(thread, e instanceof HttpError ? e.message : 'error')
  }
  const controller = new AbortController()
  const engineRes = await engineFetch(`/v1/minds/${encodeURIComponent(mind.id)}/chat`, {
    method: 'POST', signal: controller.signal,
    body: { userId: user.id, threadId: thread, message: text, mind: await runMindConfig(user, mind), secrets: await secretsForRun(user.id), ...(await runExtras(user, mind.id)) },
  })
  const sink = memorySink(onEvent)
  await relayRun(fakeReq, sink.res, engineRes, { mindId: mind.id, threadId: thread, userMessage: text, controller })
  return outcomeOf(thread, sink.out.status, sink.out.raw)
}

// A button press, answered exactly like the app's approve/decline route (`resumeRun`).
export const answerTelegramApproval: MindRunner['answer'] = async (mindId, runId, toolCallId, action) => {
  const user = await telegramOwner(mindId)
  const found = user ? await getRun(user.id, runId) : null
  if (!user || !found || found.mindId !== mindId) return failedRun('', 'run_not_found')
  const thread = found.threadId ?? ''
  const sink = memorySink()
  try {
    await resumeRun(user, found, action, { toolCallId }, telegramReq(user, mindId), sink.res)
  } catch (e) {
    return failedRun(thread, e instanceof HttpError ? e.message : 'error')
  }
  return outcomeOf(thread, sink.out.status, sink.out.raw)
}

export const telegramRunner: MindRunner = { chat: runTelegramChat, answer: answerTelegramApproval }

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
      const seller = url.searchParams.get('seller')
      if (seller !== null && !sellerSchema.safeParse(seller).success) throw new HttpError(400, 'invalid_seller')
      // Best Price Buyer (#176): the price list, without paying; it takes no seller or tx.
      const quotes = url.searchParams.get('quotes')
      if (quotes !== null && (quotes !== '1' || tx !== null || seller !== null)) throw new HttpError(400, 'invalid_query')
      // Negotiation: an offer to one seller (`?seller=&offer=`), and the same offer again on the paid step.
      const offer = url.searchParams.get('offer')
      if (offer !== null && (quotes !== null || seller === null)) throw new HttpError(400, 'invalid_query')
      if (offer !== null && !offerNearSchema.safeParse(offer).success) throw new HttpError(400, 'invalid_offer')
      const out = await shop(mindId, item.data, { txHash: tx ?? undefined, seller: seller ?? undefined, quotes: quotes === '1', offerNear: offer ?? undefined })
      return sendJson(res, out.httpStatus, out.body)
    }
    // Mind as Seller (#181): a Mind publishes what it sells (`PUT /internal/v1/offers/{item}`) and another Mind buys it
    // (`GET /internal/v1/minds/{sellerMindId}/offers/{item}`), each with its own run's wallet token.
    const offerPath = path.match(/^\/internal\/v1\/offers\/([^/]+)$/)
    const buyPath = path.match(/^\/internal\/v1\/minds\/(mnd_[0-9a-f]{24})\/offers\/([^/]+)$/)
    if (offerPath || buyPath) {
      if (!sameSecret(String(req.headers['x-engine-key'] ?? ''), config.engineApiKey)) throw new HttpError(401, 'unauthorized')
      const { userId, mindId } = verifyWalletToken(req.headers['x-wallet-token'] as string | undefined)
      await requireMind(userId, mindId)
      const item = offerItemSchema.safeParse(decodeURIComponent((offerPath ?? buyPath)!.at(-1)!))
      if (!item.success) throw new HttpError(404, 'no_offer')
      if (offerPath) {
        if (req.method !== 'PUT') throw new HttpError(405, 'method_not_allowed')
        return sendJson(res, 200, await putOffer(mindId, item.data, await readBody(req, putOfferSchema)))
      }
      if (req.method !== 'GET') throw new HttpError(405, 'method_not_allowed')
      const tx = url.searchParams.get('tx')
      if (tx !== null && !txHashSchema.safeParse(tx).success) throw new HttpError(400, 'invalid_tx_hash')
      const out = await buyOffer(mindId, buyPath![1], item.data, tx ?? undefined)
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

    // Telegram's webhook (#168): no session; the bot's secret token header is the check.
    const tg = path.match(/^\/v1\/telegram\/([A-Za-z0-9_-]{1,64})\/webhook$/)
    if (tg) {
      if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
      const update = await readBody(req, z.object({ update_id: z.number().int() }).passthrough())
      await telegramWebhook(tg[1], req.headers['x-telegram-bot-api-secret-token'] as string | undefined, update, telegramRunner)
      return sendJson(res, 200, { ok: true })
    }

    // Everything below needs a session.
    const user = await requireUser(req)
    if (route('GET', /^\/v1\/me$/)) return sendJson(res, 200, { user })
    if (route('GET', /^\/v1\/templates$/)) return sendJson(res, 200, { templates: await templates() })
    if (route('GET', /^\/v1\/skills$/)) return sendJson(res, 200, { skills: await skills() })
    const skillRoute = route('GET', /^\/v1\/skills\/([^/]+)$/)
    // Skill ids are [a-z0-9-] in the engine; anything else is unknown and never reaches it.
    if (skillRoute) return /^[a-z0-9-]{1,64}$/.test(skillRoute[1]) ? sendJson(res, 200, { skill: await skill(skillRoute[1]) }) : sendJson(res, 404, { error: 'unknown_skill' })

    // Meta-transaction relayer (realworld track, src/relay.ts): the owner's signed delegate action for an allowed registry
    // call; the relayer pays the gas. Try-out users have no NEAR account to sign with.
    if (route('POST', /^\/v1\/relay$/)) {
      denyDemo(user, 'relay')
      const { signedDelegate } = await readBody(req, z.object({ signedDelegate: z.string().min(1).max(12_000) }))
      return sendJson(res, 200, await relay(signedDelegate, user.nearAccountId))
    }

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
    const run = path.match(/^\/v1\/runs\/([^/]+)(\/approve|\/decline|\/cancel|\/proof|\/proof\/tee-explorer)?$/)
    if (run) {
      const found = await getRun(user.id, decodeURIComponent(run[1]))
      if (!found) throw new HttpError(404, 'run_not_found')
      if (!run[2] && req.method === 'GET') return sendJson(res, 200, { run: found, events: await runEvents(found.runId) })
      // The proof behind the verified badge (#254), as the engine stored it on run.verified. None: no badge, Incognito,
      // failed verification, a step without evidence, or a run from before #256.
      if (run[2] === '/proof' && req.method === 'GET') {
        const proofs = await runProofs(found.runId)
        if (!proofs.length) throw new HttpError(404, 'no_proof')
        return sendJson(res, 200, { runId: found.runId, proofs })
      }
      // The proof's Intel quote(s) checked by Phala's TEE Explorer (#277): the app opens `url`, a report already verified,
      // instead of asking the owner to paste the quote.
      if (run[2] === '/proof/tee-explorer' && req.method === 'POST') {
        const quotes = quotesOf(await runProofs(found.runId))
        if (!quotes.length) throw new HttpError(404, 'no_proof')
        const reports = []
        for (const q of quotes) reports.push({ attestation: q.attestation, kind: q.kind, ...(await explorerReport(q.intelQuote)) })
        return sendJson(res, 200, { runId: found.runId, reports })
      }
      // Stop a run that is still streaming (#121). A run paused for approval has no stream: decline it instead.
      if (run[2] === '/cancel' && req.method === 'POST') {
        const stopped = cancelRun(found.runId)
        if (!stopped) throw new HttpError(409, 'not_running', { status: found.status })
        await stopped
        return sendJson(res, 200, { run: await getRun(user.id, found.runId) })
      }
      if ((run[2] === '/approve' || run[2] === '/decline') && req.method === 'POST') {
        // Awaited, so its 409 / 429 lands in the catch below.
        return await resumeRun(user, found, run[2] === '/approve' ? 'approve' : 'decline', await readBody(req, resumeSchema), req, res)
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
      // Every payment as a CSV an accountant can open (realworld track).
      if (sub === '/payments.csv' && req.method === 'GET') {
        const csv = await paymentsCsv(mind.id)
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="hellonear-${mind.id}-payments.csv"`, 'cache-control': 'no-store' }).end(csv)
        return
      }
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

      // What the Mind remembers about its owner (#209): the engine's working memory for the current persona version.
      // Try-out users may read it but not change it.
      if (sub === '/memory') {
        const key = { userId: user.id, ...(mind.personaVersion > 0 ? { personaVersion: mind.personaVersion } : {}) }
        const path = `/v1/minds/${encodeURIComponent(mind.id)}/memory`
        if (req.method === 'GET') return passthrough(res, await engineJson(`${path}?${new URLSearchParams({ userId: user.id, ...(mind.personaVersion > 0 ? { personaVersion: String(mind.personaVersion) } : {}) })}`))
        if (req.method === 'PUT' || req.method === 'DELETE') denyDemo(user, 'edit_memory')
        if (req.method === 'PUT') return passthrough(res, await engineJson(path, { method: 'PUT', body: { ...key, markdown: (await readBody(req, memoryWriteSchema)).markdown } }))
        if (req.method === 'DELETE') return passthrough(res, await engineJson(path, { method: 'DELETE', body: key }))
        throw new HttpError(405, 'method_not_allowed')
      }

      if (sub === '' && req.method === 'GET') return sendJson(res, 200, { mind })
      if (sub === '' && req.method === 'PATCH') {
        const patch = await readBody(req, updateMindSchema)
        // Rules let a Mind act without the owner (#167): try-outs pay from the shared demo wallet, so never.
        if (patch.autoApprove) denyDemo(user, 'auto_approve')
        const { mind: updated, inboxError } = await withInbox(user, await updateMind(user.id, mind.id, patch))
        return sendJson(res, 200, { mind: updated, autopilot: await syncAutopilots(user.id, updated), ...(inboxError ? { inboxError } : {}) })
      }
      if (sub === '' && req.method === 'DELETE') {
        // Deleting drops the wallet's agent key for good, so a Mind whose own wallet still holds NEAR is refused
        // until the owner has seen the balance (#161).
        if (url.searchParams.get('acknowledgeBalance') !== 'true') await assertWalletEmpty(mind.id)
        await deleteAllWorkflows(mind.id)
        // The bot's webhook would keep pointing at a Mind that is gone, and the bot would go quiet (#171 review).
        await disconnectTelegram(mind.id).catch(() => {})
        await releaseInbox(mind.id)
        await deleteMind(user.id, mind.id)
        return res.writeHead(204).end()
      }

      if (sub === '/chat' && req.method === 'POST') {
        const body = await readBody(req, chatSchema)
        // Engine memory is keyed by thread id, so a thread id from another Mind (or user) must never pass.
        if (body.threadId && !(await threadExists(mind.id, body.threadId))) {
          throw new HttpError(404, 'thread_not_found')
        }
        const threadId = body.threadId ?? `thr_${newId('x').slice(2)}`
        await assertDemoRunAllowed(user, req)
        const controller = new AbortController()
        const engineRes = await engineFetch(`/v1/minds/${encodeURIComponent(mind.id)}/chat`, {
          method: 'POST', signal: controller.signal,
          body: { userId: user.id, threadId, message: body.message, mind: await runMindConfig(user, mind), secrets: await secretsForRun(user.id), ...timeZoneOf(body), ...(await runExtras(user, mind.id)) },
        })
        return relayRun(req, res, engineRes, { mindId: mind.id, threadId, userMessage: body.message, controller })
      }
      // Telegram (#168): the Mind's own bot, made by the owner with @BotFather.
      if (sub === '/telegram' && req.method === 'GET') return sendJson(res, 200, { telegram: await telegramStatus(mind.id) })
      if (sub === '/telegram' && req.method === 'PUT') return sendJson(res, 200, { telegram: await connectTelegram(mind.id, (await readBody(req, telegramTokenSchema)).token) })
      if (sub === '/telegram' && req.method === 'DELETE') return (await disconnectTelegram(mind.id)) ? res.writeHead(204).end() : sendJson(res, 404, { error: 'not_connected' })
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
      const one = sub.match(/^\/threads\/(thr_[a-f0-9]{24})$/)
      if (one && req.method === 'PATCH') {
        const body = await readBody(req, threadTitleSchema).catch((e) => { throw e instanceof HttpError && e.message === 'invalid_body' ? new HttpError(400, 'invalid_title') : e })
        return sendJson(res, 200, { thread: await renameThread(mind.id, one[1], body.title) })
      }
      if (one && req.method === 'DELETE') {
        await deleteThread(mind.id, one[1])
        return res.writeHead(204).end()
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
  const sweep = () => cleanupDemoUsers(async (mindId) => { await deleteAllWorkflows(mindId); await disconnectTelegram(mindId).catch(() => {}) }).then((n) => { if (n) console.log('demo users removed', n) }, (e) => console.error('demo cleanup failed', e instanceof Error ? e.message : e))
  void sweep()
  setInterval(sweep, 24 * 3600_000).unref()
  // Runs a crash left `running` (#218) end as interrupted, so they can be deleted and stop blocking their chat.
  const stuckSweep = () => sweepStuckRuns().catch((e) => console.error('stuck run sweep failed', e instanceof Error ? e.message : e))
  void stuckSweep()
  setInterval(stuckSweep, 5 * 60_000).unref()
  // Deleted chats (#207): the engine is asked again to forget them, and after 30 days they are purged for good.
  const threadSweep = () => sweepDeletedThreads().then((n) => { if (n.forgotten || n.purged) console.log('deleted threads', n) }, (e) => console.error('thread sweep failed', e instanceof Error ? e.message : e))
  void threadSweep()
  setInterval(threadSweep, 3600_000).unref()
  // Local dev without a public URL (#168): poll Telegram instead of waiting for webhooks.
  if (config.telegramPolling && !config.telegramWebhookBase) { startTelegramPolling(telegramRunner); console.log('telegram polling on') }
  // Every bot's webhook again, so bots connected before #208 also get button presses (callback_query).
  else void registerTelegramWebhooks().then((n) => { if (n.updated || n.failed) console.log('telegram webhooks set', JSON.stringify(n)) })
}
