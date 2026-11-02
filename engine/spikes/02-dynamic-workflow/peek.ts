// Prints the shape of workflow-step-output chunks from an agent step.
import { Mastra } from '@mastra/core'
import { RequestContext } from '@mastra/core/request-context'
import { PostgresStore } from '@mastra/pg'
import { config } from '../../src/config.ts'
import { MIND_KEY, mindAgent } from '../../src/mastra.ts'
import { mindSchema } from '../../src/mind.ts'
import { toolRegistry } from '../../src/tools.ts'
const storage = new PostgresStore({ id: 'spike-storage', connectionString: config.databaseUrl, schemaName: 'spike', max: 3 })
const mastra = new Mastra({ storage, agents: { mind: mindAgent }, tools: { ...toolRegistry } })
await mastra.addDynamicWorkflow({ id: 'peek', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: {} },
  graph: [{ type: 'mapping', id: 'm', mapConfig: { prompt: { value: 'Use add_numbers to add 2 and 3, then answer briefly.' } } }, { type: 'agent', id: 'ask', agentId: 'mind' }] } as any)
const rc = new RequestContext()
rc.set(MIND_KEY, mindSchema.parse({ templateId: 'general-assistant', name: 'Rex', soul: { identity: 'Helpful.' }, skills: [{ skillId: 'daily-planner' }] }))
const out: any = (await mastra.getWorkflow('peek').createRun()).stream({ inputData: {}, requestContext: rc })
const seen = new Map<string, unknown>()
for await (const c of out) {
  if (c.type !== 'workflow-step-output') { if (!seen.has(c.type)) seen.set(c.type, { keys: Object.keys(c), payloadKeys: Object.keys(c.payload ?? {}) }); continue }
  const inner = c.payload?.output
  const k = `out:${inner?.type}`
  if (!seen.has(k)) seen.set(k, { outerPayloadKeys: Object.keys(c.payload), inner: JSON.stringify(inner).slice(0, 500) })
}
for (const [k, v] of seen) console.log(k, JSON.stringify(v))
const r = await out.result
console.log('result', JSON.stringify(r.steps.ask).slice(0, 400))
process.exit(0)
