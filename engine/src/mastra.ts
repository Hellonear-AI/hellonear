// The Mastra instance: one generic Mind agent whose persona, model and tools come
// from RequestContext per request, with Postgres storage (needed for memory and
// for tool approval snapshots) and pgvector for semantic recall.
import { Mastra } from '@mastra/core'
import { Agent } from '@mastra/core/agent'
import { PgVector, PostgresStore } from '@mastra/pg'
import { Memory } from '@mastra/memory'
import { config } from './config.ts'
import { buildInstructions, type Mind } from './mind.ts'
import { chatModel, embedder } from './models.ts'
import { usableSkills } from './skills.ts'
import { toolsFor } from './tools.ts'

// Small pools: the local Postgres allows 40 connections.
const storage = new PostgresStore({ id: 'engine-storage', connectionString: config.databaseUrl, schemaName: 'mastra', max: 5 })
const vector = new PgVector({ id: 'engine-vector', connectionString: config.databaseUrl, schemaName: 'mastra', max: 5 })

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
type Ctx = { requestContext: { get: (key: string) => unknown } }
const mindOf = ({ requestContext }: Ctx) => {
  const mind = requestContext.get(MIND_KEY) as Mind | undefined
  if (!mind) throw new Error('RequestContext has no mind config')
  return mind
}

// Only skills that are not blocked; their tools and playbooks come from engine/skills.
export const skillsOf = (ctx: Ctx) => usableSkills(mindOf(ctx).skills.map((s) => s.skillId))

export const mindAgent = new Agent({
  id: 'mind',
  name: 'Mind',
  instructions: (ctx) => buildInstructions(mindOf(ctx)),
  model: (ctx) => chatModel(mindOf(ctx).model ?? config.defaultModel),
  tools: (ctx) => toolsFor(skillsOf(ctx).flatMap((s) => s.tools)),
  skills: (ctx) => skillsOf(ctx).map((s) => s.skill),
  memory,
})

export const mastra = new Mastra({ storage, agents: { mind: mindAgent } })
