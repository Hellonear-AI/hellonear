// Small HTTP helpers shared by the routes (plain node:http, like the engine).
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { z } from 'zod'
import { config } from './config.ts'

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}) { super(message) }
}

// Bodies are small (a chat message, a canvas of at most 20 nodes); refuse anything bigger.
const MAX_BODY_BYTES = 256 * 1024

export async function readJson(req: IncomingMessage): Promise<unknown> {
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

export async function readBody<S extends z.ZodType>(req: IncomingMessage, schema: S): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await readJson(req))
  if (!parsed.success) throw new HttpError(400, 'invalid_body', { issues: parsed.error.issues })
  return parsed.data
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

export function cookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

export function setCookie(res: ServerResponse, name: string, value: string, maxAgeMs: number) {
  const attrs = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`]
  if (config.cookieSecure) attrs.push('Secure')
  res.setHeader('set-cookie', attrs.join('; '))
}

// CORS for the web app origins only (FE_ORIGIN), with credentials (the session cookie).
export function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin
  if (origin === undefined || !config.feOrigins.includes(origin)) return
  res.setHeader('access-control-allow-origin', origin)
  res.setHeader('access-control-allow-credentials', 'true')
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
  res.setHeader('vary', 'origin')
}

// CSRF guard: a state-changing request from a browser must come from the web app. Requests without an
// Origin header (scripts, tests, server-to-server) carry no ambient browser cookie risk.
export function assertSameOrigin(req: IncomingMessage) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return
  const origin = req.headers.origin
  if (origin !== undefined && !config.feOrigins.includes(origin)) throw new HttpError(403, 'bad_origin')
}

// Loopback only: 127.0.0.0/8, ::1 and their IPv4-mapped forms. Used for the engine-only internal routes.
export function isLoopback(addr: string | undefined): boolean {
  if (!addr) return false
  const v4 = addr.startsWith('::ffff:') ? addr.slice(7) : addr
  return v4 === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4)
}
