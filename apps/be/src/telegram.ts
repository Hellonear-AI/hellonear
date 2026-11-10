// Telegram (#168): the owner chats with a Mind through their own bot. The owner makes the bot with @BotFather and
// pastes its token; we keep it encrypted (like secrets), register a webhook with a secret token, and hand out a
// one-time t.me/<bot>?start=<code> link. The Telegram chat that sends that code becomes the only one the bot
// answers; anyone else is ignored without a reply. Approvals never happen in Telegram: a button there would let
// whoever holds the phone approve a payment, so the bot points to the app instead.
// Bot API over fetch, no SDK (core.telegram.org/bots/api, read 10 Nov 2026): getMe, setWebhook (secret_token, sent
// back as X-Telegram-Bot-Api-Secret-Token), deleteWebhook, getUpdates (local dev without a public URL),
// sendMessage (at most 4096 characters), sendChatAction.
import { z } from 'zod'
import { config } from './config.ts'
import { decrypt, encrypt, randomToken, sameSecret } from './crypto.ts'
import { query } from './db.ts'
import { HttpError, UPSTREAM_ERROR, fetchFailure } from './http.ts'

export const telegramTokenSchema = z.object({ token: z.string().trim().regex(/^\d{5,16}:[A-Za-z0-9_-]{30,64}$/, 'not a Telegram bot token from @BotFather') })

// What one message to the Mind gives back: the reply text, and whether something waits for approval in the app.
export type RunChat = (mindId: string, threadId: string | undefined, text: string) => Promise<{ threadId: string; text: string; needsApproval: boolean; error?: string }>

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
    const hook = await bot(token, 'setWebhook', { url: webhookUrl(mindId), secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true })
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

const send = (r: Row, text: string) => bot(tokenOf(r), 'sendMessage', { chat_id: r.owner_chat_id, text, link_preview_options: { is_disabled: true } })

// Telegram shows plain text; the Mind writes light Markdown. Drop the marks that would show as symbols.
export const plainForTelegram = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/`([^`\n]+)`/g, '$1')

// 4096 characters per message; split on a paragraph or line break when one is close.
export function chunks(text: string, max = 4096): string[] {
  const out: string[] = []
  let rest = text
  while (rest.length > max) {
    const cut = Math.max(rest.lastIndexOf('\n\n', max), rest.lastIndexOf('\n', max), max * 0.6 | 0)
    const at = cut > 0 ? cut : max
    out.push(rest.slice(0, at).trimEnd())
    rest = rest.slice(at).trimStart()
  }
  if (rest.trim()) out.push(rest)
  return out
}

type Update = { update_id?: number; message?: { text?: string; chat?: { id?: number; type?: string; first_name?: string; username?: string }; from?: { is_bot?: boolean } } }

// One update from Telegram. Returns what happened, for tests and logs (never message text).
export async function handleUpdate(mindId: string, update: Update, runChat: RunChat): Promise<'linked' | 'answered' | 'ignored' | 'bad_code'> {
  const r = await rowOf(mindId)
  const m = update.message
  if (!r || !m?.chat?.id || m.chat.type !== 'private' || m.from?.is_bot || typeof m.text !== 'string') return 'ignored'
  const chatId = String(m.chat.id)
  const text = m.text.trim().slice(0, 4000)

  if (r.owner_chat_id === null) {
    // Not linked yet: only the one-time code from the app links a chat.
    const code = text.match(/^\/start\s+(\S+)$/)?.[1]
    if (!code || !r.link_code || !sameSecret(code, r.link_code)) return 'bad_code'
    const name = [m.chat.first_name, m.chat.username && `@${m.chat.username}`].filter(Boolean).join(' ').slice(0, 80) || null
    await query('update mind_telegram set owner_chat_id = $2, owner_name = $3, link_code = null, updated_at = now() where mind_id = $1 and owner_chat_id is null', [mindId, chatId, name])
    const linked = await rowOf(mindId)
    if (linked?.owner_chat_id !== chatId) return 'ignored'
    await send(linked, 'Linked. You can talk to your Mind here now. Payments and other actions still wait for your approval in the HelloNear app.')
    return 'linked'
  }
  // Anyone but the owner is ignored, without a reply.
  if (r.owner_chat_id !== chatId) return 'ignored'
  if (text === '/start') { await send(r, 'Already linked. Just write to your Mind.'); return 'answered' }

  await bot(tokenOf(r), 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {})
  const out = await runChat(mindId, r.thread_id ?? undefined, text)
  if (out.threadId !== r.thread_id) await query('update mind_telegram set thread_id = $2, updated_at = now() where mind_id = $1', [mindId, out.threadId])
  const reply = out.error
    ? `Your Mind couldn't answer that (${out.error}). Try again in a moment.`
    : [plainForTelegram(out.text.trim()) || (out.needsApproval ? '' : 'Done.'), out.needsApproval ? `This needs your approval in the app: ${config.feOrigin}/minds/${mindId}/approvals` : ''].filter(Boolean).join('\n\n')
  for (const part of chunks(reply)) await send(r, part)
  return 'answered'
}

// The webhook: the secret header must match, then Telegram gets its 200 right away (it retries slow answers) and the
// message is handled after. Unknown Minds and wrong secrets get 401 without telling which.
export async function telegramWebhook(mindId: string, secret: string | undefined, update: Update, runChat: RunChat) {
  const r = await rowOf(mindId)
  if (!r || !secret || !sameSecret(secret, r.webhook_secret)) throw new HttpError(401, 'unauthorized')
  // Each update once: Telegram may deliver it again if our 200 was lost.
  const id = Number(update.update_id ?? 0)
  const fresh = await query('update mind_telegram set last_update_id = $2 where mind_id = $1 and last_update_id < $2 returning 1', [mindId, id])
  if (!fresh.length) return
  void handleUpdate(mindId, update, runChat).catch((e) => console.error('telegram error', JSON.stringify({ mindId, error: e instanceof Error ? e.message.slice(0, 200) : 'error' })))
}

// Local dev without a public URL (TELEGRAM_POLLING=true and no TELEGRAM_WEBHOOK_BASE): one getUpdates per bot every
// two seconds, updates handled in order.
export function startTelegramPolling(runChat: RunChat, everyMs = 2000) {
  let current: Promise<void> | null = null
  const tick = async () => {
    for (const r of await query<Row>('select * from mind_telegram')) {
      // One bot failing (unreachable, a token that no longer decrypts) must not stop the others.
      try {
        const got = await bot(tokenOf(r), 'getUpdates', { offset: Number(r.last_update_id) + 1, timeout: 0, allowed_updates: ['message'] })
        for (const u of (got.ok ? got.result : []) as Update[]) {
          await query('update mind_telegram set last_update_id = $2 where mind_id = $1 and last_update_id < $2', [r.mind_id, u.update_id])
          await handleUpdate(r.mind_id, u, runChat)
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
