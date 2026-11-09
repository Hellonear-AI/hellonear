// Runtime configuration, read once from the environment.
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set (see engine/.env.example)`)
  return value
}

export const config = {
  nearaiApiKey: required('NEARAI_API_KEY'),
  databaseUrl: required('DATABASE_URL'),
  engineApiKey: required('ENGINE_API_KEY'),
  port: Number(process.env.PORT ?? 4100),
  nearaiBaseUrl: 'https://cloud-api.near.ai/v1',
  embeddingModel: 'Qwen/Qwen3-Embedding-0.6B',
  defaultModel: 'z-ai/glm-5.3-flash',
  runTimeoutMs: 120_000,
  // Reasoning tokens count against this cap; 2048 once went entirely on reasoning and left no reply (#92).
  maxOutputTokens: 4096,
  // Models sent `reasoning_effort: "low"` (#92). For GLM-5.3 Flash it means minimal reasoning (docs.near.ai/cloud/reasoning-models):
  // measured 9 Nov, still 12/12 correct, with tool runs 3x and inbox runs ~2x faster than the default full reasoning.
  lowReasoningModels: ['z-ai/glm-5.3-flash'] as string[],
  // Thread titles (#86): the cheapest Confidential TEE chat model, a short budget and a hard time limit.
  titleModel: 'z-ai/glm-5.3-flash',
  titleMaxOutputTokens: 256,
  titleTimeoutMs: 30_000,
  // Workflow run snapshots and schedule fire history older than this are pruned (#21).
  runRetentionDays: Number(process.env.RUN_RETENTION_DAYS ?? 14),
}
