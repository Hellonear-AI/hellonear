// Spike #5 follow-up: get token usage while streaming by using an AI SDK
// openai-compatible model with includeUsage, instead of the nearai router string.
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { z } from 'zod'

const nearai = createOpenAICompatible({
  name: 'nearai',
  baseURL: 'https://cloud-api.near.ai/v1',
  apiKey: process.env.NEARAI_API_KEY,
  includeUsage: true,
})

const addNumbers = createTool({
  id: 'add_numbers',
  description: 'Add two numbers and return the sum.',
  inputSchema: z.object({ a: z.number(), b: z.number() }),
  execute: async ({ a, b }) => ({ sum: a + b }),
})

for (const id of ['z-ai/glm-5.3-flash', 'deepseek-ai/DeepSeek-V4.1-Flash-1017']) {
  const agent = new Agent({ id: 'u', name: 'u', instructions: 'Use tools for arithmetic. One short sentence.', model: nearai.chatModel(id), tools: { addNumbers } })
  const s = await agent.stream('What is 17 + 25?', { maxSteps: 5, modelSettings: { maxOutputTokens: 1024 } })
  const calls: unknown[] = []
  let text = ''
  for await (const c of s.fullStream) {
    if (c.type === 'tool-call') calls.push(c.payload.args)
    if (c.type === 'text-delta') text += c.payload.text ?? ''
  }
  const u = await s.usage
  console.log(id.padEnd(40), '| tool args:', JSON.stringify(calls), '| text:', JSON.stringify(text), '| usage:', JSON.stringify({ in: u.inputTokens, out: u.outputTokens, reasoning: u.reasoningTokens, total: u.totalTokens }))
}
