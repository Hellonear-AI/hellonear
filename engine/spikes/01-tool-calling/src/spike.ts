// Spike #5: does NEAR AI tool calling work through Mastra's built-in `nearai` provider?
// Run: npm run spike   (reads NEARAI_API_KEY from engine/.env)
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

const MODELS = [
  'nearai/z-ai/glm-5.3-flash',
  'nearai/deepseek-ai/DeepSeek-V4.1-Flash-1017',
] as const

const PROMPT = 'What is 17 + 25, and what time is it right now in UTC? Use your tools.'

// Every real execution is logged here, so we can tell a genuine tool run from a model that only claims one.
const executed: { tool: string; input: unknown }[] = []

const addNumbers = createTool({
  id: 'add_numbers',
  description: 'Add two numbers and return the sum.',
  inputSchema: z.object({ a: z.number(), b: z.number() }),
  outputSchema: z.object({ sum: z.number() }),
  execute: async ({ a, b }) => {
    executed.push({ tool: 'add_numbers', input: { a, b } })
    return { sum: a + b }
  },
})

const getTime = createTool({
  id: 'get_time',
  description: 'Get the current time in UTC as an ISO 8601 string.',
  inputSchema: z.object({}),
  outputSchema: z.object({ utc: z.string() }),
  execute: async () => {
    executed.push({ tool: 'get_time', input: {} })
    return { utc: new Date().toISOString() }
  },
})

async function runModel(model: string) {
  executed.length = 0
  const agent = new Agent({
    id: 'spike-agent',
    name: 'Spike Agent',
    instructions: 'You are a precise assistant. Always use the provided tools for arithmetic and for the current time. Answer in one short sentence.',
    model,
    tools: { addNumbers, getTime },
  })

  const started = Date.now()
  const chunkCounts: Record<string, number> = {}
  const toolCalls: { toolName: string; args: unknown }[] = []
  const toolResults: { toolName: string; result: unknown }[] = []
  const samples: Record<string, unknown> = {}
  let reasoningChars = 0
  let text = ''
  let error: string | undefined

  try {
    const stream = await agent.stream(PROMPT, {
      maxSteps: 5,
      modelSettings: { maxOutputTokens: 2048, timeout: { totalMs: 120_000 } },
    })
    for await (const chunk of stream.fullStream) {
      chunkCounts[chunk.type] = (chunkCounts[chunk.type] ?? 0) + 1
      // Keep one example of each chunk type for the API contract (#7).
      if (!(chunk.type in samples)) samples[chunk.type] = chunk
      if (chunk.type === 'tool-call') toolCalls.push({ toolName: chunk.payload.toolName, args: chunk.payload.args })
      if (chunk.type === 'tool-result') toolResults.push({ toolName: chunk.payload.toolName, result: chunk.payload.result })
      if (chunk.type === 'reasoning-delta') reasoningChars += chunk.payload.text?.length ?? 0
      if (chunk.type === 'text-delta') text += chunk.payload.text ?? ''
      if (chunk.type === 'error') error = String((chunk.payload as { error?: unknown }).error)
    }
    const usage = await stream.usage
    const finishReason = await stream.finishReason
    return { model, ms: Date.now() - started, finishReason, usage, chunkCounts, toolCalls, toolResults, executed: [...executed], reasoningChars, text, error, samples }
  } catch (e) {
    return { model, ms: Date.now() - started, chunkCounts, toolCalls, toolResults, executed: [...executed], reasoningChars, text, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e), samples }
  }
}

function verdict(r: Awaited<ReturnType<typeof runModel>>) {
  const add = r.executed.find((c) => c.tool === 'add_numbers')?.input as { a?: number; b?: number } | undefined
  const addOk = !!add && [add.a, add.b].sort().join() === [17, 25].sort().join()
  const timeOk = r.executed.some((c) => c.tool === 'get_time')
  const answerOk = /\b42\b/.test(r.text)
  return { addOk, timeOk, answerOk, pass: addOk && timeOk && answerOk && !r.error }
}

if (!process.env.NEARAI_API_KEY) throw new Error('NEARAI_API_KEY is not set (expected in engine/.env)')

const results = []
for (const model of MODELS) {
  const r = await runModel(model)
  const v = verdict(r)
  results.push({ ...r, verdict: v })
  console.log(`\n=== ${model} (${r.ms} ms) → ${v.pass ? 'PASS' : 'FAIL'}`)
  console.log('verdict     ', v)
  console.log('finish      ', r.finishReason, '| error:', r.error ?? 'none')
  console.log('usage       ', JSON.stringify(r.usage))
  console.log('chunk types ', JSON.stringify(r.chunkCounts))
  console.log('tool calls  ', JSON.stringify(r.toolCalls))
  console.log('executed    ', JSON.stringify(r.executed))
  console.log('reasoning   ', r.reasoningChars, 'chars')
  console.log('answer      ', JSON.stringify(r.text))
}

const { writeFile } = await import('node:fs/promises')
await writeFile(new URL('../results.json', import.meta.url), JSON.stringify(results, null, 2))
console.log('\nFull results (incl. one sample per chunk type) written to results.json')
