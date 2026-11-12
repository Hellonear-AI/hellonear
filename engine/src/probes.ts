// NEAR AI checks for the status page (status.hellonear.xyz). The backend asks for them every 5 minutes through
// `GET /internal/v1/probes`, since only the engine holds the NEAR AI key. Plain requests, not the verified chat
// transport: they only ask whether NEAR AI answers, and no run or badge depends on them. The key never leaves here.
export type ProbeStatus = 'operational' | 'degraded' | 'down'
export type Probe = { id: 'nearai-chat' | 'nearai-embeddings'; status: ProbeStatus; latencyMs: number | null; detail: string | null }

type Target = { baseUrl: string; apiKey: string; chatModel: string; embeddingModel: string }

// Answers slower than this count as degraded; no answer within the timeout counts as down.
export const LIMITS = { chat: { degradedMs: 10_000, timeoutMs: 30_000 }, embeddings: { degradedMs: 5_000, timeoutMs: 15_000 } }

async function one(id: Probe['id'], limits: { degradedMs: number; timeoutMs: number }, call: (signal: AbortSignal) => Promise<boolean>): Promise<Probe> {
  const started = Date.now()
  try {
    const ok = await call(AbortSignal.timeout(limits.timeoutMs))
    const latencyMs = Date.now() - started
    if (!ok) return { id, status: 'down', latencyMs, detail: 'Answered without a result.' }
    return latencyMs > limits.degradedMs ? { id, status: 'degraded', latencyMs, detail: `Slow: answered in ${(latencyMs / 1000).toFixed(1)} s.` } : { id, status: 'operational', latencyMs, detail: null }
  } catch (e) {
    const name = (e as { name?: string })?.name
    if (name === 'TimeoutError') return { id, status: 'down', latencyMs: null, detail: `No answer in ${limits.timeoutMs / 1000} s.` }
    return { id, status: 'down', latencyMs: null, detail: e instanceof HttpStatus ? `Answered HTTP ${e.status}.` : 'Could not reach it.' }
  }
}

class HttpStatus extends Error {
  constructor(readonly status: number) { super(`HTTP ${status}`) }
}

async function post(t: Target, path: string, body: unknown, signal: AbortSignal): Promise<any> {
  const res = await fetch(`${t.baseUrl}${path}`, { method: 'POST', signal, headers: { authorization: `Bearer ${t.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new HttpStatus(res.status)
  return res.json()
}

export async function nearAiProbes(t: Target): Promise<Probe[]> {
  return Promise.all([
    one('nearai-chat', LIMITS.chat, async (signal) => {
      const out = await post(t, '/chat/completions', { model: t.chatModel, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 32, reasoning_effort: 'low' }, signal)
      return Array.isArray(out?.choices) && out.choices.length > 0
    }),
    one('nearai-embeddings', LIMITS.embeddings, async (signal) => {
      const out = await post(t, '/embeddings', { model: t.embeddingModel, input: 'ping' }, signal)
      return (out?.data?.[0]?.embedding?.length ?? 0) > 0
    }),
  ])
}
