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
  maxOutputTokens: 2048,
  // Workflow run snapshots and schedule fire history older than this are pruned (#21).
  runRetentionDays: Number(process.env.RUN_RETENTION_DAYS ?? 14),
}
