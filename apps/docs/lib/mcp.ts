// A minimal, stateless MCP server over Streamable HTTP: each POST carries one JSON-RPC message and gets one JSON
// answer (no sessions, no SSE). Read-only: it searches and reads the same pages the site renders.
import { getPage, pageMarkdown, search } from './content'
import { SITE_URL } from './site'

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
export const SERVER_INFO = { name: 'hellonear-docs', title: 'HelloNear Docs', version: '0.1.0' }

export const TOOLS = [
  {
    name: 'search_docs',
    title: 'Search the HelloNear docs',
    description: 'Search the HelloNear documentation (concepts, API, contracts, trust) by keywords. Returns the best pages with a URL, a description and a matching line.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords, for example "daily limit" or "run.verified"' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'How many pages to return (default 5)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'read_page',
    title: 'Read a HelloNear docs page',
    description: 'Read one HelloNear docs page as Markdown, by path ("/quickstart", "trust/faq") or full URL. Use search_docs first to find the path.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Page path or URL, for example "/wallet-and-approvals"' } },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

type Id = string | number | null
type Message = { jsonrpc?: unknown; id?: Id; method?: unknown; params?: Record<string, unknown> }
export type Reply = { jsonrpc: '2.0'; id: Id; result?: unknown; error?: { code: number; message: string } }

const ok = (id: Id, result: unknown): Reply => ({ jsonrpc: '2.0', id, result })
const fail = (id: Id, code: number, message: string): Reply => ({ jsonrpc: '2.0', id, error: { code, message } })
const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) })

/** One JSON-RPC message in, one answer out; null for a notification (the route answers 202 with no body). */
export function handle(msg: unknown, base = SITE_URL): Reply | null {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return fail(null, -32600, 'Invalid Request: send one JSON-RPC object')
  const m = msg as Message
  const id: Id = typeof m.id === 'string' || typeof m.id === 'number' ? m.id : null
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') return fail(id, -32600, 'Invalid Request')
  const isNotification = !('id' in m)
  if (isNotification) return null
  const params = m.params && typeof m.params === 'object' ? m.params : {}

  switch (m.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'Read-only access to the HelloNear docs and Trust Center. Use search_docs to find pages, then read_page to read one as Markdown.',
      })
    }
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: TOOLS })
    case 'tools/call': {
      const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {}
      if (params.name === 'search_docs') {
        if (typeof args.query !== 'string' || !args.query.trim()) return fail(id, -32602, 'search_docs needs a non-empty "query" string')
        const limit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.trunc(args.limit) : 5
        const hits = search(args.query, limit, base)
        if (!hits.length) return ok(id, text(`No pages match "${args.query}".`))
        return ok(id, {
          ...text(hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.description}\n   ${h.snippet}`).join('\n\n')),
          structuredContent: { results: hits.map(({ slug, title, url, description, snippet, score }) => ({ path: `/${slug}`, title, url, description, snippet, score })) },
        })
      }
      if (params.name === 'read_page') {
        if (typeof args.path !== 'string') return fail(id, -32602, 'read_page needs a "path" string')
        const page = getPage(args.path)
        if (!page) return ok(id, text(`No page at "${args.path}". Use search_docs to find one.`, true))
        return ok(id, text(`${pageMarkdown(page)}\nSource: ${base}/${page.slug}\n`))
      }
      return fail(id, -32602, `Unknown tool: ${String(params.name)}`)
    }
    default:
      return fail(id, -32601, `Method not found: ${m.method}`)
  }
}
