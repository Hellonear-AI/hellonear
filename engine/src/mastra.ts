// The Mastra instance: one generic Mind agent whose persona, model and tools come
// from RequestContext per request, with Postgres storage (needed for memory and
// for tool approval snapshots) and pgvector for semantic recall.
import { Mastra } from '@mastra/core'
import { Agent } from '@mastra/core/agent'
import { TokenLimiterProcessor } from '@mastra/core/processors'
import { PgVector, PostgresStore } from '@mastra/pg'
import { Memory } from '@mastra/memory'
import { config } from './config.ts'
import { buildInstructions, promptMind, type Mind } from './mind.ts'
import { chatModel, embedder } from './models.ts'
import { mindSkills } from './skills.ts'
import { DEMO_KEY } from './email.ts'
import { TIME_ZONE_KEY, toolRegistry, toolsFor } from './tools.ts'

// Small pools: the local Postgres allows 40 connections.
// Every run stores a snapshot (~8 KB) and every Autopilot fire a trigger row; prune() deletes old ones.
const keep = { maxAge: `${config.runRetentionDays}d` } as const
export const storage = new PostgresStore({
  id: 'engine-storage', connectionString: config.databaseUrl, schemaName: 'mastra', max: 5,
  retention: { workflows: { workflowSnapshot: keep }, schedules: { triggers: keep } },
})
export const vector = new PgVector({ id: 'engine-vector', connectionString: config.databaseUrl, schemaName: 'mastra', max: 5 })

const memory = new Memory({
  vector,
  embedder,
  options: {
    lastMessages: 20,
    semanticRecall: { topK: 3, messageRange: 1, scope: 'resource' },
    workingMemory: { enabled: true, scope: 'resource' },
  },
})

export const MIND_KEY = 'mind'
// Set for workflow runs (#20): no human is watching, so approval tools are hidden.
export const UNATTENDED_KEY = 'unattended'
type Ctx = { requestContext: { get: (key: string) => unknown } }
const mindOf = ({ requestContext }: Ctx) => {
  const mind = requestContext.get(MIND_KEY) as Mind | undefined
  if (!mind) throw new Error('RequestContext has no mind config')
  return mind
}

// Only skills that are not blocked; their tools and playbooks come from engine/skills.
// Equipped skills plus the built-in HelloNear guide (#114).
export const skillsOf = (ctx: Ctx) => mindSkills(mindOf(ctx).skills.map((s) => s.skillId))

export const mindAgent = new Agent({
  id: 'mind',
  name: 'Mind',
  // A demo run never skips an approval (#167), and an unattended one (workflow, Autopilot) has no approval tools at all,
  // so neither prompt mentions rules (James, #236 review: the backend sends the rules with workflow runs too).
  instructions: (ctx) => {
    const mind = mindOf(ctx)
    const rulesApply = ctx.requestContext.get(DEMO_KEY) !== true && ctx.requestContext.get(UNATTENDED_KEY) !== true
    return buildInstructions(promptMind(mind, rulesApply), { timeZone: ctx.requestContext.get(TIME_ZONE_KEY) as string | undefined })
  },
  model: (ctx) => chatModel(mindOf(ctx).model ?? config.defaultModel),
  tools: (ctx) => toolsFor(skillsOf(ctx).flatMap((s) => s.tools), { unattended: ctx.requestContext.get(UNATTENDED_KEY) === true }),
  skills: (ctx) => skillsOf(ctx).map((s) => s.skill),
  memory,
  // Bounds every model call's prompt (#123): 'contiguous' keeps the newest turns that fit, keeps the system prompt and
  // keeps a tool call with its result. Stored history is untouched; only what reaches the model is trimmed.
  inputProcessors: [new TokenLimiterProcessor({ limit: config.contextTokenLimit, trimMode: 'contiguous' })],
  // Also applies to agent steps inside workflows, which get no per-call options.
  // No automatic retries: each completion must map to one verifiable request (#19).
  defaultOptions: {
    maxSteps: 8,
    modelSettings: { maxOutputTokens: config.maxOutputTokens, maxRetries: 0, timeout: { totalMs: config.runTimeoutMs } },
  },
})

// Tools are registered on the instance too, so builder workflows (#20) can call them by key.
// Call mastra.startWorkers() at boot: it loads the workflows saved in Postgres.
export const mastra = new Mastra({ storage, agents: { mind: mindAgent }, tools: { ...toolRegistry } })
