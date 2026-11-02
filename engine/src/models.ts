// NEAR AI Cloud models. Built with @ai-sdk/openai-compatible and includeUsage so
// streaming reports token usage; the `nearai/<id>` router string streams empty usage (spike #5).
//
// Chat goes through the NEAR AI SDK's fetch transport, which verifies Gateway and model
// attestation and keeps the exact request/response bytes so each completion can be
// verified afterwards with verifyResponse(id) (#19).
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { InferenceClient } from '@nearai/inference-sdk/node'
import { config } from './config.ts'
import type { StepResult } from './verify.ts'

export const inferenceClient = new InferenceClient({ apiKey: config.nearaiApiKey })

const verifiedChat = createOpenAICompatible({
  name: 'nearai',
  baseURL: inferenceClient.getBaseUrl(),
  apiKey: config.nearaiApiKey,
  includeUsage: true,
  fetch: inferenceClient.fetch,
})

// Embeddings need no badge, so they use a plain client.
const plain = createOpenAICompatible({ name: 'nearai', baseURL: config.nearaiBaseUrl, apiKey: config.nearaiApiKey })

export const chatModel = (modelId: string) => verifiedChat.chatModel(modelId)
export const embedder = plain.textEmbeddingModel(config.embeddingModel)

type ModelInfo = { input: number; output: number; verifiable: boolean }
let models: Map<string, ModelInfo> | undefined

// Prices and the privacy flag from the public model list, cached for the process lifetime.
// `verifiable` is true for Confidential TEE and 3P Confidential TEE models, false for Incognito.
export async function modelInfo(modelId: string): Promise<ModelInfo | undefined> {
  if (!models) {
    const res = await fetch(`${config.nearaiBaseUrl}/model/list`)
    const body = (await res.json()) as { models: { modelId: string; inputCostPerToken: { amount: number; scale: number }; outputCostPerToken: { amount: number; scale: number }; metadata?: { verifiable?: boolean } }[] }
    models = new Map(body.models.map((m) => [m.modelId, { input: m.inputCostPerToken.amount / 10 ** m.inputCostPerToken.scale, output: m.outputCostPerToken.amount / 10 ** m.outputCostPerToken.scale, verifiable: m.metadata?.verifiable === true }]))
  }
  return models.get(modelId)
}

export const priceOf = modelInfo

// Verifies each completion of a run; a failure becomes a failed step, never an exception.
export async function verifyCompletions(ids: string[]): Promise<StepResult[]> {
  return Promise.all(
    ids.map(async (id): Promise<StepResult> => {
      try {
        const v = await inferenceClient.verifyResponse(id)
        return { id, ok: true, signatureKind: v.signatureKind }
      } catch (e) {
        const err = e as { code?: string; message?: string }
        return { id, ok: false, error: err.code ?? err.message ?? String(e) }
      }
    }),
  )
}
