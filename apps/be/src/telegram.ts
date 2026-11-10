// Telegram (#168): the owner chats with a Mind through their own bot. The owner makes the bot with @BotFather and
// pastes its token; we keep it encrypted (like secrets), register a webhook with a secret token, and hand out a
// one-time t.me/<bot>?start=<code> link. The Telegram chat that sends that code becomes the only one the bot
// answers; anyone else is ignored without a reply.
// Approvals (#208): each approval a Telegram run asks for comes as its own message with the same checks as the app's
// card and inline buttons. A button carries only an opaque one-time code (telegram_approvals, migration 013); a press
// counts only from the owner's own Telegram account, and resumes the run through the same path as the app
// (`MindRunner.answer`). The wallet policy is still enforced in the TEE before signing; Telegram adds no power beyond
// the owner's own tap.
// Bot API over fetch, no SDK (core.telegram.org/bots/api, read 10 and 11 Nov 2026): getMe, setWebhook (secret_token,
// sent back as X-Telegram-Bot-Api-Secret-Token; allowed_updates), deleteWebhook, getUpdates (local dev without a public
// URL), sendMessage (at most 4096 characters; reply_markup inline_keyboard, callback_data 1-64 bytes), sendChatAction,
// answerCallbackQuery ("clients will display a progress bar until you call answerCallbackQuery"), editMessageText,
// editMessageReplyMarkup, deleteMessage. Messages are Telegram HTML (#221, src/telegramFormat.ts); a reply streams in
// as it is written (#222, LiveReply).
import { z } from 'zod'
import { config } from './config.ts'
import { decrypt, encrypt, randomToken, sameSecret } from './crypto.ts'
import { query } from './db.ts'
import { HttpError, UPSTREAM_ERROR, fetchFailure } from './http.ts'
import { approvalChecks, approvalDetails, explorerTxUrl, fixFirstLabel, paymentOf, refusalReasons, type WalletView } from './approvals.ts'
import { isAwaiting } from './runs.ts'
import { cantParse, escapeHtml, escapeMd, plainOf, telegramChunks } from './telegramFormat.ts'
import { getWallet, hasWallet } from './wallets.ts'

export const telegramTokenSchema = z.object({ token: z.string().trim().regex(/^\d{5,16}:[A-Za-z0-9_-]{30,64}$/, 'not a Telegram bot token from @BotFather') })

// What one run (a message to the Mind, or a resume after a button) gave back: the reply text, the approvals it asks
// for now, and what the tools it ran returned.
export type Asked = { runId: string; toolCallId: string; tool: string; args: unknown }
export type ToolOutcome = { toolCallId: string; tool: string; type: 'tool.result' | 'tool.error'; status?: string; error?: string; result?: any }
export type RunOutcome = { threadId: string; text: string; asked: Asked[]; outcomes: ToolOutcome[]; error?: string }
// How Telegram reaches the Mind (src/server.ts): `chat` runs one owner message like the app's chat; `answer` approves or
// declines like the app's approve/decline route. Both relay into memory, so runs are stored exactly as from the app.
export type MindRunner = {
  chat: (mindId: string, threadId: string | undefined, text: string, onEvent?: (e: Record<string, any>) => void) => Promise<RunOutcome>
  answer: (mindId: string, runId: string, toolCallId: string, action: 'approve' | 'decline') => Promise<RunOutcome>
}

// Reads a relayed run (the SSE text the sink collected) back into a RunOutcome. A non-200 answer is its JSON error.
export function outcomeOf(threadId: string, status: number, raw: string): RunOutcome {
  if (status !== 200) {
    const error = (() => { try { return String(JSON.parse(raw).error ?? 'engine_error') } catch { return 'engine_error' } })()
    return { threadId, text: '', asked: [], outcomes: [], error }
  }
  const events = raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)) } catch { return null } }).filter(Boolean) as Record<string, any>[]
  return {
    threadId,
    text: events.filter((e) => e.type === 'text.delta').map((e) => e.text ?? '').join(''),
    asked: events.filter((e) => e.type === 'tool.approval_required' && e.toolCallId).map((e) => ({ runId: e.runId, toolCallId: e.toolCallId, tool: String(e.tool ?? ''), args: e.args })),
    outcomes: events.filter((e) => (e.type === 'tool.result' || e.type === 'tool.error') && e.toolCallId)
      .map((e) => ({ toolCallId: e.toolCallId, tool: String(e.tool ?? ''), type: e.type, status: e.status, error: typeof e.error === 'string' ? e.error : undefined, result: e.result })),
    ...(events.some((e) => e.type === 'run.error') ? { error: 'run_error' } : {}),
  }
}

// Both setWebhook and getUpdates must ask for button presses too, or Telegram never sends them.
const ALLOWED_UPDATES = ['message', 'callback_query']

type Row = { mind_id: string; bot_id: string; bot_username: string; token_ciphertext: string; webhook_secret: string; link_code: string | null; owner_chat_id: string | null; owner_name: string | null; thread_id: string | null; last_update_id: string }
const aad = (mindId: string) => `telegram:${mindId}`
const tokenOf = (r: Row) => decrypt(config.secretsMasterKey, r.token_ciphertext, aad(r.mind_id))
const rowOf = async (mindId: string) => (await query<Row>('select * from mind_telegram where mind_id = $1', [mindId]))[0] ?? null

async function bot(token: string, method: string, body: Record<string, unknown> = {}): Promise<{ status: number; ok: boolean; result?: any; description?: string }> {
  let res: Response
  try {
    res = await fetch(`${config.telegramApiUrl}/bot${token}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    // Never put the URL in the error: it holds the token.
    throw new HttpError(UPSTREAM_ERROR, 'telegram_unreachable', { reason: fetchFailure(e) })
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string }
  return { status: res.status, ok: json.ok === true, result: json.result, description: typeof json.description === 'string' ? json.description.slice(0, 200) : undefined }
}

const webhookUrl = (mindId: string) => `${config.telegramWebhookBase}/v1/telegram/${encodeURIComponent(mindId)}/webhook`
const linkOf = (r: Pick<Row, 'bot_username' | 'link_code'>) => (r.link_code ? `https://t.me/${r.bot_username}?start=${r.link_code}` : null)

export function statusOf(r: Row | null) {
  if (!r) return { connected: false as const }
  return { connected: true as const, botUsername: r.bot_username, linked: r.owner_chat_id !== null, ownerName: r.owner_name, linkUrl: r.owner_chat_id === null ? linkOf(r) : null, mode: config.telegramWebhookBase ? 'webhook' : 'polling' }
}

export const telegramStatus = async (mindId: string) => statusOf(await rowOf(mindId))

// Checks the token with getMe, stores it, and points the bot at us. Pasting a token again (same or new bot) resets
// the owner link, so the owner opens the new link once.
export async function connectTelegram(mindId: string, token: string) {
  const me = await bot(token, 'getMe')
  if (me.status === 401 || me.status === 404 || !me.ok || !me.result?.is_bot) throw new HttpError(400, 'invalid_telegram_token')
  const taken = await query<{ mind_id: string }>('select mind_id from mind_telegram where bot_id = $1 and mind_id <> $2', [me.result.id, mindId])
  if (taken.length) throw new HttpError(409, 'telegram_bot_in_use')
  const secret = randomToken(32)
  if (config.telegramWebhookBase) {
    const hook = await bot(token, 'setWebhook', { url: webhookUrl(mindId), secret_token: secret, allowed_updates: ALLOWED_UPDATES, drop_pending_updates: true })
    if (!hook.ok) throw new HttpError(UPSTREAM_ERROR, 'telegram_error', { action: 'setWebhook', reason: hook.description })
  } else {
    // Polling (local dev): getUpdates refuses to run while a webhook is set.
    await bot(token, 'deleteWebhook', { drop_pending_updates: true })
  }
  await query(
    `insert into mind_telegram (mind_id, bot_id, bot_username, token_ciphertext, webhook_secret, link_code) values ($1, $2, $3, $4, $5, $6)
     on conflict (mind_id) do update set bot_id = excluded.bot_id, bot_username = excluded.bot_username, token_ciphertext = excluded.token_ciphertext,
       webhook_secret = excluded.webhook_secret, link_code = excluded.link_code, owner_chat_id = null, owner_name = null, last_update_id = 0, updated_at = now()`,
    [mindId, me.result.id, String(me.result.username), encrypt(config.secretsMasterKey, token, aad(mindId)), secret, randomToken(12)],
  )
  return telegramStatus(mindId)
}

// Best effort on Telegram's side: the row goes either way, so the bot stops answering.
export async function disconnectTelegram(mindId: string): Promise<boolean> {
  const r = await rowOf(mindId)
  if (!r) return false
  await bot(tokenOf(r), 'deleteWebhook', { drop_pending_updates: true }).catch(() => {})
  await query('delete from mind_telegram where mind_id = $1', [mindId])
  return true
}

// Bots connected before #208 had a webhook for messages only, and Telegram keeps a webhook's allowed_updates until
// setWebhook runs again. So at every start the backend sets each bot's webhook again (same URL and secret, pending
// updates kept): one call per bot, and it fixes any bot whose registration falls behind the code, now or later, without
// a one-off script someone must remember to run. Best effort per bot; a failure is logged and the others go on.
export async function registerTelegramWebhooks(): Promise<{ updated: number; failed: number }> {
  let updated = 0
  let failed = 0
  if (!config.telegramWebhookBase) return { updated, failed }
  for (const r of await query<Row>('select * from mind_telegram')) {
    try {
      const hook = await bot(tokenOf(r), 'setWebhook', { url: webhookUrl(r.mind_id), secret_token: r.webhook_secret, allowed_updates: ALLOWED_UPDATES })
      if (!hook.ok) throw new Error(`setWebhook ${hook.status}`)
      updated++
    } catch (e) {
      failed++
      console.error('telegram error', JSON.stringify({ mindId: r.mind_id, action: 'setWebhook', error: e instanceof Error ? e.message.slice(0, 200) : 'error' }))
    }
  }
  return { updated, failed }
}

type Chat = { id?: number; type?: string; first_name?: string; username?: string }
type CallbackQuery = { id?: string; from?: { id?: number; is_bot?: boolean }; message?: { message_id?: number; chat?: Chat }; data?: string }
type Update = { update_id?: number; message?: { text?: string; chat?: Chat; from?: { is_bot?: boolean } }; callback_query?: CallbackQuery }

type Button = { text: string; callback_data: string } | { text: string; url: string }
type Keyboard = Button[][]

// Sends or edits one message of Telegram HTML (#221, `parse_mode: "HTML"`), optionally with a keyboard. Two fallbacks, so
// a message is never lost: Telegram refusing the HTML (400 "can't parse entities") gets the same message as plain text;
// Telegram refusing a URL button it can't open (e.g. a localhost FE in local dev; which ones is not proven) gets the
// same message once more with the links written in the text instead.
async function deliver(r: Row, method: 'sendMessage' | 'editMessageText', body: Record<string, unknown>, html: string, keyboard: Keyboard = []) {
  const call = (t: string, isHtml: boolean, k: Keyboard) =>
    bot(tokenOf(r), method, { ...body, text: t, ...(isHtml ? { parse_mode: 'HTML' } : {}), link_preview_options: { is_disabled: true }, ...(k.length ? { reply_markup: { inline_keyboard: k } } : {}) })
  let isHtml = true
  let text = html
  let res = await call(text, isHtml, keyboard)
  if (!res.ok && res.status === 400 && cantParse(res.description)) {
    isHtml = false
    text = plainOf(html).slice(0, 4096)
    res = await call(text, isHtml, keyboard)
  }
  const links = keyboard.flat().filter((b): b is { text: string; url: string } => 'url' in b)
  if (res.ok || res.status !== 400 || !links.length || notModified(res.description)) return res
  const esc = isHtml ? escapeHtml : (s: string) => s
  return call([text, '', ...links.map((b) => `${esc(b.text)}: ${esc(b.url)}`)].join('\n'), isHtml, keyboard.map((row) => row.filter((b) => !('url' in b))).filter((row) => row.length))
}
// An edit to the text a message already has: harmless, Telegram just says so.
const notModified = (description: string | undefined) => /message is not modified/i.test(description ?? '')

// The Mind's Markdown (or a fixed sentence of ours) as one or more messages to the owner.
async function sendReply(r: Row, markdown: string) {
  for (const part of telegramChunks(markdown)) await deliver(r, 'sendMessage', { chat_id: r.owner_chat_id }, part)
}
// #222: Telegram clears "typing…" after 5 s or when the bot sends a message ("The status is set for 5 seconds or less"),
// and limits how often a bot may edit, so typing is repeated every 4 s and edits come at most every 1.5 s. Tests shorten them.
export const telegramTiming = { typingMs: 4000, editMs: 1500 }

// A reply shown while it is written (#222). The first text goes out at once; later text edits that message, at most
// once per `editMs`; past 4096 characters it continues in a new message. Every send and edit is the whole text so far
// through the #221 converter: a half-written Markdown mark stays a literal character until its pair arrives (the
// converter only pairs closed marks), so a mid-stream message is always valid HTML. On run.finished the last edit shows
// the complete reply, without waiting for run.verified. "typing…" is repeated until the first text is shown, and again
// while a tool runs.
class LiveReply {
  private text = ''
  private msgs: { id: number; html: string }[] = []
  private tools = 0
  private chain: Promise<void> = Promise.resolve()
  private timer: NodeJS.Timeout | undefined
  private lastFlush = 0
  private typing: NodeJS.Timeout
  private finished: Promise<void> | undefined

  constructor(private r: Row) {
    const tick = () => { if (!this.finished && (!this.msgs.length || this.tools > 0)) void bot(tokenOf(r), 'sendChatAction', { chat_id: r.owner_chat_id, action: 'typing' }).catch(() => {}) }
    tick()
    this.typing = setInterval(tick, telegramTiming.typingMs)
  }

  // True once any of the reply is on the owner's screen.
  get shown() { return this.msgs.length > 0 }

  onEvent = (e: Record<string, any>) => {
    if (this.finished) return
    if (e.type === 'text.delta' && typeof e.text === 'string') { this.text += e.text; this.schedule() }
    else if (e.type === 'tool.called') this.tools++
    // A tool that waits for the owner's approval is not running: no typing while the run is paused.
    else if ((e.type === 'tool.result' || e.type === 'tool.error' || e.type === 'tool.approval_required') && this.tools > 0) this.tools--
    else if (e.type === 'run.finished' || e.type === 'run.error') void this.finish()
  }

  private schedule() {
    if (this.timer || !this.text.trim()) return
    const wait = this.lastFlush ? Math.max(0, this.lastFlush + telegramTiming.editMs - Date.now()) : 0
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.lastFlush = Date.now()
      this.chain = this.chain.then(() => this.flush())
    }, wait)
  }

  // Brings the owner's messages up to the text so far: changed parts are edited, new parts sent, and parts the text no
  // longer needs (a final text that packs into fewer messages) deleted.
  private async flush() {
    const parts = telegramChunks(this.text.trim())
    for (let i = 0; i < parts.length; i++) {
      const m = this.msgs[i]
      if (!m) {
        const res = await deliver(this.r, 'sendMessage', { chat_id: this.r.owner_chat_id }, parts[i]).catch(() => null)
        if (res?.ok && typeof res.result?.message_id === 'number') this.msgs[i] = { id: res.result.message_id, html: parts[i] }
        else return
      } else if (m.html !== parts[i]) {
        const res = await deliver(this.r, 'editMessageText', { chat_id: this.r.owner_chat_id, message_id: m.id }, parts[i]).catch(() => null)
        // "message is not modified" means it already shows this text.
        if (res?.ok || notModified(res?.description)) m.html = parts[i]
      }
    }
    for (const m of this.msgs.splice(parts.length)) await bot(tokenOf(this.r), 'deleteMessage', { chat_id: this.r.owner_chat_id, message_id: m.id }).catch(() => {})
  }

  // The last edit, with the complete text; safe to call more than once.
  finish() {
    this.finished ??= (async () => {
      clearInterval(this.typing)
      clearTimeout(this.timer)
      this.timer = undefined
      await this.chain
      if (this.text.trim()) await this.flush()
    })()
    return this.finished
  }
}

// Approval cards (#208): the title bold, every other line literal. Their words come from tool arguments (an email
// subject, an event title someone else wrote), so they are escaped, never read as Markdown: a stranger's subject
// cannot add a link or formatting to a message that asks the owner to approve.
const card = (title: string, ...lines: string[]) => [`<b>${escapeHtml(title)}</b>`, ...lines.map(escapeHtml)].join('\n')

const chatUrl = (mindId: string, threadId: string) => `${config.feOrigin}/minds/${mindId}/chat/${threadId}`
const walletUrl = (mindId: string) => `${config.feOrigin}/minds/${mindId}/wallet`
// The checks read the wallet as the app does; no wallet, or OutLayer not answering, means no checks (the TEE still decides).
const walletOf = async (mindId: string): Promise<WalletView | null> => ((await hasWallet(mindId)) ? getWallet(mindId).catch(() => null) : null)
// callback_data: "a:" and 16 random bytes (24 characters in all, under Telegram's 64 bytes). Nothing else goes in a button.
const newCode = () => `a:${randomToken(16)}`
const mark = (ok: boolean) => (ok ? '✓' : '✗')

// One message per approval: what is asked, the app's checks, and the buttons. When the wallet policy would refuse the
// payment (over the limit, not on the list, frozen), or the wallet holds less than it (unfunded counts as 0, #228),
// there is no Approve button: the reason, and a button to Wallet to fix it first, as in the app.
export async function askOwner(r: Row, threadId: string, asked: Asked) {
  const mindId = r.mind_id
  const payment = paymentOf(asked.tool, asked.args)
  let title: string
  const lines: string[] = []
  let next: ReturnType<typeof approvalChecks>['next'] = 'approve'
  if (payment) {
    title = `Pay ${payment.amountNear} NEAR to ${payment.to}`
    const checked = approvalChecks(payment, await walletOf(mindId))
    next = checked.next
    lines.push(...checked.checks.map((c) => `${mark(c.ok)} ${c.text}`))
    if (next === 'fund') lines.push('', "Approving now would fail: the wallet doesn't hold enough NEAR. Add NEAR in Wallet first.")
    else if (next !== 'approve') lines.push('', 'Approving now would be refused by the wallet policy before signing. Fix it in Wallet first.')
  } else {
    // Telegram sends no time zone, so times are shown in UTC and say so.
    const details = approvalDetails(asked.tool, asked.args, 'UTC')
    title = details?.title ?? `Approve ${asked.tool || 'an action'}`
    for (const l of details?.lines ?? []) lines.push(/^\d+$/.test(l.label) ? `${l.label}. ${l.value}` : `${l.label}: ${l.value}${l.label === 'When' ? ' (UTC)' : ''}`)
    if (details?.note) lines.push('', details.note)
  }
  // The codes exist before the message does, so a press can never arrive for a code we don't know yet.
  const decline = newCode()
  const approve = next === 'approve' ? newCode() : null
  for (const [code, action] of [[approve, 'approve'], [decline, 'decline']] as const) {
    if (code) await query('insert into telegram_approvals (code, mind_id, run_id, tool_call_id, action, title) values ($1, $2, $3, $4, $5, $6)', [code, mindId, asked.runId, asked.toolCallId, action, title])
  }
  const keyboard: Keyboard = approve
    ? [[{ text: 'Approve', callback_data: approve }, { text: 'Decline', callback_data: decline }], [{ text: 'Open in app', url: chatUrl(mindId, threadId) }]]
    : [[{ text: 'Decline', callback_data: decline }], [{ text: fixFirstLabel(next as Exclude<typeof next, 'approve'>), url: walletUrl(mindId) }]]
  await deliver(r, 'sendMessage', { chat_id: r.owner_chat_id }, card(title, ...(lines.length ? ['', ...lines] : []), '', 'Waiting for you.'), keyboard)
}

// The edited message after a press: what happened, in the app's words. A payment the wallet refused says so, never
// "rejected on-chain" and never with a tx link (there is no tx: OutLayer refuses before signing).
async function resultOf(mindId: string, title: string, action: 'approve' | 'decline', tool: string, args: unknown, outcome: ToolOutcome | undefined): Promise<{ text: string; keyboard: Keyboard }> {
  const payment = paymentOf(tool, args)
  const done = (line: string, keyboard: Keyboard = []) => ({ text: card(title, '', ...line.split('\n')), keyboard })
  const why = (s: unknown) => (s === undefined || s === null ? '' : String(s).slice(0, 300))
  if (action === 'decline') return done(payment ? 'Declined. Nothing was sent.' : 'Declined.')
  if (!payment) {
    if (!outcome) return done('Approved.')
    return outcome.type === 'tool.result' ? done('Approved. Done.') : done(`Approved, but it didn't go through (${why(outcome.error ?? outcome.status) || 'error'}).`)
  }
  const result = (outcome?.result ?? {}) as { status?: string; txHash?: string; message?: string; to?: string; amountNear?: string }
  const status = result.status ?? outcome?.status
  if (status === 'sent' && typeof result.txHash === 'string') {
    return done(`Sent ${result.amountNear ?? payment.amountNear} NEAR to ${result.to ?? payment.to}.`, [[{ text: 'See it on NearBlocks', url: explorerTxUrl(result.txHash) }]])
  }
  if (status === 'wallet_frozen') return done('Not sent: the wallet is frozen, so it was refused before signing. Nothing left your wallet.')
  if (status === 'policy_denied') {
    const reasons = refusalReasons(payment, (await walletOf(mindId))?.policy ?? null)
    return done(['Not sent: refused by the wallet policy before signing. Nothing left your wallet.', ...reasons.map((x) => `${mark(false)} ${x}`)].join('\n'))
  }
  if (status === 'pending') return done(`Not confirmed yet: ${why(result.message) || 'waiting for the wallet'}.`)
  return done(`Not sent: it didn't go through (${why(result.message ?? outcome?.error) || 'no answer from the wallet'}).`)
}

type CodeRow = { code: string; mind_id: string; run_id: string; tool_call_id: string; action: 'approve' | 'decline'; title: string; used_at: Date | null }

// A button press. Always answers the callback query (Telegram shows a spinner until then), whatever happens.
export async function handleCallback(r: Row, cq: CallbackQuery, runner: MindRunner): Promise<'stranger' | 'unknown' | 'already_answered' | 'answered' | 'failed' | 'ignored'> {
  if (!cq.id) return 'ignored'
  const token = tokenOf(r)
  const answer = (text: string) => bot(token, 'answerCallbackQuery', { callback_query_id: cq.id, text }).catch(() => {})
  // Only the linked owner's own Telegram account (in a private chat, user id = chat id). Anyone else: a note, nothing else.
  if (r.owner_chat_id === null || cq.from?.id === undefined || String(cq.from.id) !== r.owner_chat_id) { await answer('Only the owner can approve'); return 'stranger' }
  const [code] = await query<CodeRow>('select * from telegram_approvals where code = $1 and mind_id = $2', [String(cq.data ?? ''), r.mind_id])
  if (!code) { await answer('This button no longer works'); return 'unknown' }
  const where = cq.message?.message_id !== undefined ? { chat_id: r.owner_chat_id, message_id: cq.message.message_id } : null
  const edit = async (html: string, keyboard: Keyboard = []) => { if (where) await deliver(r, 'editMessageText', where, html, keyboard).catch(() => {}) }
  const already = async () => { await answer('Already answered'); await edit(card(code.title, '', 'Already answered.')); return 'already_answered' as const }

  // One use: the first press uses up both buttons of the message.
  const claimed = await query<{ code: string }>('update telegram_approvals set used_at = now() where run_id = $1 and tool_call_id = $2 and used_at is null returning code', [code.run_id, code.tool_call_id])
  if (!claimed.some((c) => c.code === code.code)) return already()
  // Answered in the app already (or the run moved past it): the same 409 the route gives, before the spinner says more.
  if (!(await isAwaiting(code.run_id, code.tool_call_id))) return already()

  const [asked] = await query<{ payload: { tool?: string; args?: unknown } }>(
    `select payload from run_events where run_id = $1 and type = 'tool.approval_required' and payload->>'toolCallId' = $2 order by seq desc limit 1`, [code.run_id, code.tool_call_id])
  const tool = String(asked?.payload.tool ?? '')
  await answer(code.action === 'decline' ? 'Declined' : paymentOf(tool, asked?.payload.args) ? 'Sending…' : 'Approving…')
  if (where) await bot(token, 'editMessageReplyMarkup', where).catch(() => {})

  const out = await runner.answer(r.mind_id, code.run_id, code.tool_call_id, code.action)
  if (out.error === 'not_awaiting_approval') { await edit(card(code.title, '', 'Already answered.')); return 'already_answered' }
  if (out.error && !out.outcomes.length && !out.text) {
    await edit(card(code.title, '', `Couldn't answer that (${out.error}). Try again in the app.`),out.threadId ? [[{ text: 'Open in app', url: chatUrl(r.mind_id, out.threadId) }]] : [])
    return 'failed'
  }
  const result = await resultOf(r.mind_id, code.title, code.action, tool, asked?.payload.args, out.outcomes.find((o) => o.toolCallId === code.tool_call_id))
  await edit(result.text, result.keyboard)
  // Then the Mind's reply after the answer, as a normal message, and the next approval if it asks for one (a split bill).
  await sendReply(r, out.text.trim())
  for (const a of out.asked) await askOwner(r, out.threadId, a)
  return 'answered'
}

// One update from Telegram. Returns what happened, for tests and logs (never message text).
export async function handleUpdate(mindId: string, update: Update, runner: MindRunner): Promise<'linked' | 'answered' | 'ignored' | 'bad_code' | Awaited<ReturnType<typeof handleCallback>>> {
  const r = await rowOf(mindId)
  if (r && update.callback_query) return handleCallback(r, update.callback_query, runner)
  const m = update.message
  if (!r || !m?.chat?.id || m.chat.type !== 'private' || m.from?.is_bot || typeof m.text !== 'string') return 'ignored'
  const chatId = String(m.chat.id)
  const text = m.text.trim().slice(0, 4000)

  if (r.owner_chat_id === null) {
    // Not linked yet: only the one-time code from the app links a chat.
    const code = text.match(/^\/start\s+(\S+)$/)?.[1]
    if (!code || !r.link_code || !sameSecret(code, r.link_code)) {
      // Opening the bot directly sends a bare /start (seen live on 10 Nov). While nobody owns the bot, say how to link
      // it; once linked, strangers get no reply at all.
      await bot(tokenOf(r), 'sendMessage', { chat_id: chatId, text: 'This bot is not linked yet. Open the link shown in the HelloNear app (Connections, Telegram) to link it to your Mind.' }).catch(() => {})
      return 'bad_code'
    }
    const name = [m.chat.first_name, m.chat.username && `@${m.chat.username}`].filter(Boolean).join(' ').slice(0, 80) || null
    await query('update mind_telegram set owner_chat_id = $2, owner_name = $3, link_code = null, updated_at = now() where mind_id = $1 and owner_chat_id is null', [mindId, chatId, name])
    const linked = await rowOf(mindId)
    if (linked?.owner_chat_id !== chatId) return 'ignored'
    await sendReply(linked, 'Linked. You can talk to your Mind here now. Payments and other actions still wait for you: it asks here with Approve and Decline buttons, and the HelloNear app shows the same request.')
    return 'linked'
  }
  // Anyone but the owner is ignored, without a reply.
  if (r.owner_chat_id !== chatId) return 'ignored'
  if (text === '/start') { await sendReply(r, 'Already linked. Just write to your Mind.'); return 'answered' }

  // The reply streams in while the run goes on (#222), and is complete at run.finished, before verification.
  const live = new LiveReply(r)
  let out: RunOutcome
  try {
    out = await runner.chat(mindId, r.thread_id ?? undefined, text, live.onEvent)
  } finally {
    await live.finish()
  }
  if (out.threadId !== r.thread_id) await query('update mind_telegram set thread_id = $2, updated_at = now() where mind_id = $1', [mindId, out.threadId])
  if (out.error) await sendReply(r, `Your Mind couldn't answer that (${escapeMd(out.error)}). Try again in a moment.`)
  else if (!live.shown && !out.asked.length) await sendReply(r, out.text.trim() || 'Done.')
  // Each approval the run asks for gets its own message with buttons (a split bill's two payments get two).
  for (const a of out.asked) await askOwner(r, out.threadId, a)
  return 'answered'
}

// The webhook: the secret header must match, then Telegram gets its 200 right away (it retries slow answers) and the
// message is handled after. Unknown Minds and wrong secrets get 401 without telling which.
export async function telegramWebhook(mindId: string, secret: string | undefined, update: Update, runner: MindRunner) {
  const r = await rowOf(mindId)
  if (!r || !secret || !sameSecret(secret, r.webhook_secret)) throw new HttpError(401, 'unauthorized')
  // Each update once: Telegram may deliver it again if our 200 was lost.
  const id = Number(update.update_id ?? 0)
  const fresh = await query('update mind_telegram set last_update_id = $2 where mind_id = $1 and last_update_id < $2 returning 1', [mindId, id])
  if (!fresh.length) return
  void handleUpdate(mindId, update, runner).catch((e) => console.error('telegram error', JSON.stringify({ mindId, error: e instanceof Error ? e.message.slice(0, 200) : 'error' })))
}

// Local dev without a public URL (TELEGRAM_POLLING=true and no TELEGRAM_WEBHOOK_BASE): one getUpdates per bot every
// two seconds, updates handled in order.
export function startTelegramPolling(runner: MindRunner, everyMs = 2000) {
  let current: Promise<void> | null = null
  const tick = async () => {
    for (const r of await query<Row>('select * from mind_telegram')) {
      // One bot failing (unreachable, a token that no longer decrypts) must not stop the others.
      try {
        const got = await bot(tokenOf(r), 'getUpdates', { offset: Number(r.last_update_id) + 1, timeout: 0, allowed_updates: ALLOWED_UPDATES })
        for (const u of (got.ok ? got.result : []) as Update[]) {
          await query('update mind_telegram set last_update_id = $2 where mind_id = $1 and last_update_id < $2', [r.mind_id, u.update_id])
          await handleUpdate(r.mind_id, u, runner)
        }
      } catch (e) {
        console.error('telegram error', JSON.stringify({ mindId: r.mind_id, error: e instanceof Error ? e.message.slice(0, 200) : 'error' }))
      }
    }
  }
  const timer = setInterval(() => { if (!current) current = tick().catch(() => {}).finally(() => { current = null }) }, everyMs)
  // Stops polling and waits for the round in flight, so nothing runs after the caller moves on.
  return async () => { clearInterval(timer); await current }
}
