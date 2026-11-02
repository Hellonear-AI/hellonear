// Spike #5 follow-up: does token usage come through generate() and stream() via the nearai provider?
import { Agent } from '@mastra/core/agent'
const agent = new Agent({ id: 'u', name: 'u', instructions: 'Be brief.', model: 'nearai/z-ai/glm-5.3-flash' })
const g = await agent.generate('Say hi', { modelSettings: { maxOutputTokens: 300 } })
console.log('generate usage     ', JSON.stringify(g.usage), '| text:', JSON.stringify(g.text))
const s = await agent.stream('Say hi', { modelSettings: { maxOutputTokens: 300 } })
await s.consumeStream?.()
console.log('stream usage       ', JSON.stringify(await s.usage))
for (const t of [20, 60, 150]) {
  const r = await agent.generate('What is the capital of France? One word.', { modelSettings: { maxOutputTokens: t } })
  console.log(`maxOutputTokens=${t}`.padEnd(19), 'finish:', r.finishReason, '| text:', JSON.stringify(r.text), '| reasoning chars:', (r.reasoningText ?? '').length)
}
