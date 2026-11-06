// Spike #21: do Mastra schedules fire our builder (dynamic) workflows with the Mind config?
// Run: cd engine && node --env-file=.env --import tsx spikes/03-autopilot/spike.ts
import { Mastra } from '@mastra/core'
import { PostgresStore } from '@mastra/pg'
import { config } from '../../src/config.ts'
import { MIND_KEY, UNATTENDED_KEY, mindAgent } from '../../src/mastra.ts'
import { mindSchema } from '../../src/mind.ts'
import { toolRegistry } from '../../src/tools.ts'

const storage = new PostgresStore({
  id: 'spike-storage', connectionString: config.databaseUrl, schemaName: 'spike', max: 3,
  retention: { workflows: { workflowSnapshot: { maxAge: '1s' } }, schedules: { triggers: { maxAge: '1s' } } },
})
const mastra = new Mastra({ storage, agents: { mind: mindAgent }, tools: { ...toolRegistry } })
const log = (label: string, v: unknown) => console.log(`\n## ${label}\n${JSON.stringify(v, null, 2)?.slice(0, 1800)}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const mind = mindSchema.parse({ templateId: 'payments', name: 'Penny', soul: { identity: 'Always sign every reply with "— Penny".' }, skills: [{ skillId: 'payments' }] })
const id = 'spike-autopilot'
await mastra.addDynamicWorkflow({
  id,
  inputSchema: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] },
  outputSchema: { type: 'object', properties: {} },
  graph: [
    { type: 'mapping', id: 'm0', mapConfig: {} },
    { type: 'tool', id: 'now', toolId: 'get_time' },
    { type: 'mapping', id: 'm1', mapConfig: { prompt: { template: 'In one short sentence about ${initData.topic}: list the names of the tools you have (or say none), then mention the time ${stepResults.now.utc}.' } } },
    { type: 'agent', id: 'write', agentId: 'mind' },
  ],
} as any)
log('registered', mastra.getWorkflow(id).id)

for (const s of await mastra.schedules.list({ workflowId: id })) await mastra.schedules.delete(s.id)
const sched = await mastra.schedules.create({
  id: 'spike-every-20s', workflowId: id, cron: '*/20 * * * * *', inputData: { topic: 'rent' },
  requestContext: { [MIND_KEY]: mind, [UNATTENDED_KEY]: true, secrets: { HOOK: 'not-a-map' } },
  resourceId: 'user-1', metadata: { mindId: 'penny' },
})
log('created', sched)

await mastra.startWorkers()
const t0 = Date.now()
await sleep(50_000)
const manual = await mastra.schedules.run(sched.id)
log('manual run', manual)
await sleep(25_000)

const triggers = await (await storage.getStore('schedules'))!.listTriggers(sched.id)
log('triggers', triggers)
const wf = mastra.getWorkflow(id)
for (const t of triggers) {
  const run = t.runId ? await wf.getWorkflowRunById(t.runId) : null
  const steps = (run as any)?.steps ?? {}
  log(`run ${t.runId}`, {
    status: run?.status, resourceId: (run as any)?.resourceId,
    write: steps.write?.output?.text?.slice(0, 300), writeStatus: steps.write?.status, error: (run as any)?.error,
  })
}
const runs = await wf.listWorkflowRuns({ resourceId: 'user-1' } as any)
log('listWorkflowRuns by resourceId', { total: runs.total, ids: runs.runs.map((r) => r.runId) })
log('elapsed s', (Date.now() - t0) / 1000)

await mastra.schedules.pause(sched.id)
log('after pause', await mastra.schedules.get(sched.id))
await mastra.stopWorkers()
await sleep(1500)
log('prune', await storage.prune())
log('runs after prune', (await wf.listWorkflowRuns()).total)
await mastra.schedules.delete(sched.id)
process.exit(0)
