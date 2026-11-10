// A stand-in for the Telegram Bot API routes the backend uses (src/telegram.ts), so tests need no bot. Shapes from
// core.telegram.org/bots/api (read 10 Nov 2026). Records every call with its token, so tests can check which bot.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

export const fakeTelegram = {
  calls: [] as { token: string; method: string; body: any }[],
  bots: new Map<string, { id: number; username: string }>(),
  updates: new Map<string, any[]>(),
  sent(token: string) { return this.calls.filter((c) => c.token === token && c.method === 'sendMessage').map((c) => c.body) },
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
  fakeTelegram.calls.push({ token, method, body })
  const bot = fakeTelegram.bots.get(token)
  if (!bot) return send(res, 401, { ok: false, error_code: 401, description: 'Unauthorized' })
  if (method === 'getMe') return send(res, 200, { ok: true, result: { id: bot.id, is_bot: true, first_name: 'Test', username: bot.username } })
  if (method === 'setWebhook' || method === 'deleteWebhook' || method === 'sendChatAction') return send(res, 200, { ok: true, result: true })
  if (method === 'sendMessage') return send(res, 200, { ok: true, result: { message_id: fakeTelegram.calls.length, chat: { id: body.chat_id }, text: body.text } })
  if (method === 'getUpdates') {
    const all = fakeTelegram.updates.get(token) ?? []
    return send(res, 200, { ok: true, result: all.filter((u) => u.update_id >= (body.offset ?? 0)) })
  }
  send(res, 400, { ok: false, error_code: 400, description: 'Bad Request: method not faked' })
})
