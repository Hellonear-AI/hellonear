// A stand-in for the engine HTTP API (docs/api-contract.md §2) with canned events, so backend tests need no
// NEAR AI credit. It records every request so tests can check what the backend sent.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

export const ENGINE_KEY = 'test-engine-key'

export const fake = {
  requests: [] as { method: string; path: string; body: any }[],
  workflows: new Map<string, any>(),
  autopilots: new Map<string, any>(),
  nextSeq: new Map<string, number>(),
  // Simulates an engine restart between a pause and its approval: seq starts at 0 again.
  restartBeforeResume: false,
  // Runs whose stream the backend closed before the end (a cancel, #121).
  cutOff: new Set<string>(),
}

export const templates = [
  {
    templateId: 'general-assistant', name: 'General Assistant', tagline: 'Helps.', quote: 'I keep your day in order.',
    soul: { identity: 'You help.', invariants: ['Never invent facts.'], priors: [] }, model: 'z-ai/glm-5.3-flash',
    skills: [{ skillId: 'daily-planner', description: 'Plans days.', status: 'available', connections: [] }],
  },
  {
    templateId: 'payments-mind', name: 'Payments Mind', tagline: 'Pays.', quote: 'I keep your bills paid and your limits boring.',
    soul: { identity: 'You pay bills.', invariants: ['Every payment waits for approval.'], priors: [] }, model: 'z-ai/glm-5.3-flash',
    skills: [
      { skillId: 'payments', description: 'Pays.', status: 'simulated', connections: ['near-wallet'] },
      { skillId: 'daily-planner', description: 'Plans days.', status: 'available', connections: [] },
    ],
  },
]

// The whole catalog: `http-request` is in no template, as in the real engine.
export const skills = [
  { skillId: 'daily-planner', description: 'Plans days.', status: 'available', connections: [], tools: ['plan_day'] },
  { skillId: 'http-request', description: 'Calls HTTPS APIs.', status: 'available', connections: [], tools: ['http_request'] },
  { skillId: 'payments', description: 'Pays.', status: 'simulated', connections: ['near-wallet'], tools: ['send_payment'] },
  { skillId: 'email-address', description: 'Own email address.', status: 'available', connections: ['agentmail'], tools: ['mail_send', 'mail_list', 'mail_read'] },
]

async function json(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : undefined
}
const send = (res: ServerResponse, status: number, body?: unknown) =>
  body === undefined ? res.writeHead(status).end() : res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Writes events with awkward chunking: each event split in two writes, so the backend parser is exercised.
async function stream(res: ServerResponse, runId: string, mindId: string, start: number, events: Record<string, unknown>[], delayMs = 0) {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  let ended = false
  res.on('close', () => { if (!ended) fake.cutOff.add(runId) })
  let seq = start
  for (const e of events) {
    if (res.destroyed) return
    const line = `data: ${JSON.stringify({ v: 1, runId, mindId, seq: seq++, ts: new Date().toISOString(), ...e })}\n\n`
    const cut = Math.floor(line.length / 2)
    res.write(line.slice(0, cut))
    res.write(line.slice(cut))
    if (delayMs) await sleep(delayMs)
  }
  fake.nextSeq.set(runId, seq)
  ended = true
  res.end()
}

const deltas = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'text.delta', text: `w${i} ` }))

export const engine = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://engine')
  const body = await json(req)
  fake.requests.push({ method: req.method ?? '', path: url.pathname + url.search, body })
  if (url.pathname === '/v1/health') return send(res, 200, { ok: true })
  if (req.headers['x-engine-key'] !== ENGINE_KEY) return send(res, 401, { error: 'unauthorized' })
  if (url.pathname === '/v1/templates') return send(res, 200, { templates })
  if (url.pathname === '/v1/skills') return send(res, 200, { skills })

  const chat = url.pathname.match(/^\/v1\/minds\/([^/]+)\/chat$/)
  if (chat && req.method === 'POST') {
    const mindId = chat[1]
    const runId = `run_${randomUUID()}`
    const started = { type: 'run.started', threadId: body.threadId, model: body.mind.model, nodeId: `model:${body.mind.model}`, skills: body.mind.skills.map((s: any) => s.skillId) }
    if (body.message.includes('pay')) {
      return stream(res, runId, mindId, 0, [
        started, { type: 'step.started', step: 1 },
        { type: 'tool.approval_required', toolCallId: 'call_1', tool: 'pay_invoice', nodeId: `wallet:${mindId}`, args: { amount: '5' } },
        { type: 'run.finished', finishReason: 'suspended', text: '', usage: {}, costUsd: 0.0001, verification: { status: 'pending' } },
      ])
    }
    if (body.message === 'not allowed') return send(res, 400, { error: 'invalid_body', issues: [{ message: 'nope' }] })
    return stream(res, runId, mindId, 0, [
      started, { type: 'step.started', step: 1 },
      { type: 'tool.called', toolCallId: 'c1', tool: 'get_time', nodeId: 'tool:get_time', args: {} },
      { type: 'tool.result', toolCallId: 'c1', tool: 'get_time', nodeId: 'tool:get_time', result: { now: 'x' }, status: 'ok' },
      ...deltas(body.message === 'slow' ? 20 : 40),
      { type: 'step.finished', step: 1, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
      { type: 'run.finished', finishReason: 'stop', text: 'done', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, costUsd: 0.00042, verification: { status: 'pending' } },
      { type: 'run.verified', model: body.mind.model, nodeId: `model:${body.mind.model}`, verification: { status: 'verified', level: 'gateway_tee', completionIds: ['c'] } },
    ], body.message === 'slow' ? 20 : 0)
  }

  const resume = url.pathname.match(/^\/v1\/runs\/([^/]+)\/(approve|decline)$/)
  if (resume && req.method === 'POST') {
    const runId = resume[1]
    const mindId = url.searchParams.get('mindId')!
    const start = fake.restartBeforeResume ? 0 : fake.nextSeq.get(runId) ?? 0
    const approved = resume[2] === 'approve'
    return stream(res, runId, mindId, start, [
      approved
        ? { type: 'tool.result', toolCallId: body.toolCallId, tool: 'pay_invoice', nodeId: `wallet:${mindId}`, result: { ok: true }, status: 'ok' }
        : { type: 'tool.error', toolCallId: body.toolCallId, tool: 'pay_invoice', nodeId: `wallet:${mindId}`, status: 'error', error: 'declined' },
      { type: 'text.delta', text: approved ? 'Paid.' : 'Cancelled.' },
      { type: 'run.finished', finishReason: 'stop', text: approved ? 'Paid.' : 'Cancelled.', usage: {}, costUsd: 0.0001, verification: { status: 'pending' } },
    ])
  }

  const wf = url.pathname.match(/^\/v1\/minds\/([^/]+)\/workflows(?:\/([^/]+))?(\/runs|\/autopilot)?$/)
  if (wf) {
    const [, mindId, workflowId, tail] = wf
    const key = `${mindId}/${workflowId}`
    if (!workflowId && req.method === 'GET') {
      return send(res, 200, { workflows: [...fake.workflows.entries()].filter(([k]) => k.startsWith(`${mindId}/`)).map(([k, v]) => ({ workflowId: k.split('/')[1], name: v.name })) })
    }
    if (!tail && req.method === 'PUT') {
      if (!body?.nodes) return send(res, 400, { error: 'invalid_workflow', issues: [{ path: 'nodes', message: 'required' }] })
      fake.workflows.set(key, body)
      return send(res, 200, { workflowId, tools: [], steps: [], schedule: null, autopilot: null })
    }
    if (!fake.workflows.has(key)) return send(res, 404, { error: 'not_found' })
    if (!tail && req.method === 'GET') return send(res, 200, { workflowId, ...fake.workflows.get(key) })
    if (!tail && req.method === 'DELETE') { fake.workflows.delete(key); fake.autopilots.delete(key); return send(res, 204) }
    if (tail === '/runs' && req.method === 'POST') {
      return stream(res, `run_${randomUUID()}`, mindId, 0, [
        { type: 'workflow.started', workflowId, nodeId: `workflow:${workflowId}`, model: body.mind.model, skills: [] },
        { type: 'node.started', node: 'balance', nodeType: 'tool', nodeId: 'tool:near_view_account' },
        { type: 'node.finished', node: 'balance', nodeType: 'tool', nodeId: 'tool:near_view_account', status: 'ok', output: { balanceNear: 3 } },
        { type: 'workflow.finished', workflowId, status: 'success' },
        { type: 'run.verified', verification: { status: 'not_applicable', reason: 'no_completions' } },
      ])
    }
    if (tail === '/runs' && req.method === 'GET') return send(res, 200, { runs: [] })
    if (tail === '/autopilot' && req.method === 'PUT') {
      fake.autopilots.set(key, body)
      const status = body.enabled === false ? 'paused' : 'active'
      if (!body.mind.skills.length) return send(res, 409, { error: 'cannot_autopilot', issues: [{ code: 'missing_tools', message: 'no tools' }], autopilot: { status: 'paused' } })
      return send(res, 200, { autopilot: { status, cron: '0 * * * *', timezone: 'UTC', nextFireAt: null, lastFireAt: null, lastRunId: null, pausedFor: [] } })
    }
    if (tail === '/autopilot' && req.method === 'GET') return send(res, 200, { autopilot: fake.autopilots.has(key) ? { status: 'active' } : null })
    if (tail === '/autopilot' && req.method === 'DELETE') return fake.autopilots.delete(key) ? send(res, 204) : send(res, 404, { error: 'not_found' })
  }
  send(res, 404, { error: 'not_found' })
})
