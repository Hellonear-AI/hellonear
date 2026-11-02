// NEAR AI Cloud models. Built with @ai-sdk/openai-compatible and includeUsage so
// streaming reports token usage; the `nearai/<id>` router string streams empty usage (spike #5).
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { config } from './config.ts'

const nearai = createOpenAICompatible({
  name: 'nearai',
  baseURL: config.nearaiBaseUrl,
  apiKey: config.nearaiApiKey,
  includeUsage: true,
})

export const chatModel = (modelId: string) => nearai.chatModel(modelId)
export const embedder = nearai.textEmbeddingModel(config.embeddingModel)

type Price = { input: number; output: number }
let prices: Map<string, Price> | undefined

// Per-token USD prices from the public model list, cached for the process lifetime.
export async function priceOf(modelId: string): Promise<Price | undefined> {
  if (!prices) {
    const res = await fetch(`${config.nearaiBaseUrl}/model/list`)
    const body = (await res.json()) as { models: { modelId: string; inputCostPerToken: { amount: number; scale: number }; outputCostPerToken: { amount: number; scale: number } }[] }
    prices = new Map(body.models.map((m) => [m.modelId, { input: m.inputCostPerToken.amount / 10 ** m.inputCostPerToken.scale, output: m.outputCostPerToken.amount / 10 ** m.outputCostPerToken.scale }]))
  }
  return prices.get(modelId)
}
