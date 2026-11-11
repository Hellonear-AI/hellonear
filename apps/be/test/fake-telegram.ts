// A stand-in for the Telegram Bot API routes the backend uses (src/telegram.ts), so tests need no bot. Shapes from
// core.telegram.org/bots/api (read 10 and 11 Nov 2026). Records every call with its token and time, so tests can check
// which bot and in what rhythm.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

export const fakeTelegram = {
  calls: [] as { token: string; method: string; body: any; at: number }[],
  bots: new Map<string, { id: number; username: string }>(),
  updates: new Map<string, any[]>(),
  // The text and parse mode of every message sent, by message id, so an edit to the same text answers "not modified".
  messages: new Map<number, { text: string; parseMode?: string }>(),
  // When true, a URL button pointing at localhost is refused with 400, to exercise the fallback (links in the text).
  refuseLocalUrls: false,
  // When true, the next sendMessage with parse_mode HTML is refused with 400 "can't parse entities" (then it resets), to
  // exercise the plain-text fallback (#221).
  refuseHtmlOnce: false,
  sent(token: string) { return this.calls.filter((c) => c.token === token && c.method === 'sendMessage').map((c) => c.body) },
  of(token: string, method: string) { return this.calls.filter((c) => c.token === token && c.method === method).map((c) => c.body) },
}

// Telegram's "HTML style" rules (core.telegram.org/bots/api, read 11 Nov 2026), checked as strictly as we can: only the
// listed tags, closed in order; <a> needs an href; a language class only on <code> inside <pre>; every <, > and & outside
// a tag escaped, and only &lt; &gt; &amp; &quot; or numeric entities. Returns why a text is refused, or null.
const TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'tg-spoiler', 'span', 'a', 'code', 'pre', 'blockquote'])
const ENTITY = /^&(?:lt|gt|amp|quot|#\d+|#x[0-9a-fA-F]+);/
export function telegramHtmlError(html: string): string | null {
  const stack: string[] = []
  let i = 0
  const badText = (s: string) => {
    if (/[<>]/.test(s)) return 'unescaped < or >'
    for (let j = s.indexOf('&'); j >= 0; j = s.indexOf('&', j + 1)) if (!ENTITY.test(s.slice(j))) return `unsupported entity at ${j}`
    return null
  }
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    const text = html.slice(i, lt < 0 ? html.length : lt)
    const bad = badText(text)
    if (bad) return bad
    if (lt < 0) break
    const m = html.slice(lt).match(/^<(\/?)([a-z-]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*>/)
    if (!m) return `unsupported start tag at byte offset ${lt}`
    const [whole, closing, tag, attrs] = m
    if (!TAGS.has(tag)) return `unsupported start tag "${tag}"`
    if (closing) {
      if (stack.pop() !== tag) return `unmatched end tag "${tag}"`
    } else {
      const a = attrs.trim()
      if (tag === 'a' && !/^href="[^"]*"$/.test(a)) return '<a> without href'
      if (tag === 'a' && stack.includes('a')) return 'nested <a>'
      if (tag === 'code' && a && !(/^class="language-[\w#+.-]+"$/.test(a) && stack.at(-1) === 'pre')) return 'bad <code> class'
      if (tag === 'blockquote' && a && a !== 'expandable') return 'bad <blockquote> attribute'
      if (tag === 'span' && a !== 'class="tg-spoiler"') return 'bad <span>'
      if (!['a', 'code', 'blockquote', 'span'].includes(tag) && a) return `attribute on <${tag}>`
      if (stack.includes('code') || (stack.includes('pre') && !(tag === 'code' && stack.at(-1) === 'pre'))) return `<${tag}> inside code`
      const v = a.match(/="([^"]*)"/)?.[1]
      if (v !== undefined && badText(v)) return 'unescaped attribute'
      stack.push(tag)
    }
    i = lt + whole.length
  }
  return stack.length ? `unclosed <${stack.at(-1)}>` : null
}

const send = (res: ServerResponse, status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
async function json(req: IncomingMessage) {
  let s = ''
  for await (const c of req) s += c
  return s ? JSON.parse(s) : {}
}

export const telegramServer = createServer(async (req, res) => {
  const m = (req.url ?? '').match(/^\/bot([^/]+)\/(\w+)$/)
  if (!m) return send(res, 404, { ok: false, error_code: 404, description: 'Not Found' })
  const [, token, method] = m
  const body = await json(req)
  fakeTelegram.calls.push({ token, method, body, at: Date.now() })
  const bot = fakeTelegram.bots.get(token)
  if (!bot) return send(res, 401, { ok: false, error_code: 401, description: 'Unauthorized' })
  if (method === 'getMe') return send(res, 200, { ok: true, result: { id: bot.id, is_bot: true, first_name: 'Test', username: bot.username } })
  if (method === 'setWebhook' || method === 'deleteWebhook' || method === 'sendChatAction') return send(res, 200, { ok: true, result: true })
  const urls = (body.reply_markup?.inline_keyboard ?? []).flat().map((b: any) => b.url).filter(Boolean) as string[]
  if (fakeTelegram.refuseLocalUrls && urls.some((u) => /^https?:\/\/localhost/.test(u))) return send(res, 400, { ok: false, error_code: 400, description: 'Bad Request: inline keyboard button URL is invalid' })
  if (method === 'sendMessage' || method === 'editMessageText') {
    if (typeof body.text !== 'string' || !body.text.length) return send(res, 400, { ok: false, error_code: 400, description: 'Bad Request: message text is empty' })
    if (body.parse_mode !== undefined && body.parse_mode !== 'HTML') return send(res, 400, { ok: false, error_code: 400, description: 'Bad Request: unsupported parse_mode' })
    const refuseOnce = method === 'sendMessage' && body.parse_mode === 'HTML' && fakeTelegram.refuseHtmlOnce
    if (refuseOnce) fakeTelegram.refuseHtmlOnce = false
    const why = body.parse_mode === 'HTML' ? (refuseOnce ? 'Unsupported start tag "x" at byte offset 0' : telegramHtmlError(body.text)) : null
    if (why) return send(res, 400, { ok: false, error_code: 400, description: `Bad Request: can't parse entities: ${why}` })
    // The limit counts the text after entities are parsed; HTML is at least as long, so this is stricter than Telegram.
    if (body.text.length > 4096) return send(res, 400, { ok: false, error_code: 400, description: 'Bad Request: message is too long' })
  }
  if (method === 'sendMessage') {
    const id = fakeTelegram.calls.length
    fakeTelegram.messages.set(id, { text: body.text, parseMode: body.parse_mode })
    return send(res, 200, { ok: true, result: { message_id: id, chat: { id: body.chat_id }, text: body.text } })
  }
  // Button presses (#208): the answer to the press, and edits of the message that carried the buttons.
  if (method === 'answerCallbackQuery') return send(res, 200, { ok: true, result: true })
  if (method === 'editMessageText' || method === 'editMessageReplyMarkup' || method === 'deleteMessage') {
    if (!body.chat_id || !body.message_id) return send(res, 400, { ok: false, error_code: 400, description: 'Bad Request: message to edit not found' })
    const known = fakeTelegram.messages.get(body.message_id)
    if (method === 'deleteMessage') { fakeTelegram.messages.delete(body.message_id); return send(res, 200, { ok: true, result: true }) }
    if (method === 'editMessageText') {
      if (known && known.text === body.text && known.parseMode === body.parse_mode && !body.reply_markup) return send(res, 400, { ok: false, error_code: 400, description: 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message' })
      fakeTelegram.messages.set(body.message_id, { text: body.text, parseMode: body.parse_mode })
    }
    return send(res, 200, { ok: true, result: { message_id: body.message_id, chat: { id: body.chat_id }, text: body.text } })
  }
  if (method === 'getUpdates') {
    const all = fakeTelegram.updates.get(token) ?? []
    return send(res, 200, { ok: true, result: all.filter((u) => u.update_id >= (body.offset ?? 0)) })
  }
  send(res, 400, { ok: false, error_code: 400, description: 'Bad Request: method not faked' })
})
