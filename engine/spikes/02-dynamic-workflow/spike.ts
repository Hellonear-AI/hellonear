// Spike #20: can a Mastra dynamic workflow drive our Mind agent and tools?
// Run: cd engine && node --env-file=.env --import tsx spikes/02-dynamic-workflow/spike.ts
import { Mastra } from '@mastra/core'
import { RequestContext } from '@mastra/core/request-context'
import { PostgresStore } from '@mastra/pg'
import { config } from '../../src/config.ts'
import { MIND_KEY, mindAgent } from '../../src/mastra.ts'
import { mindSchema } from '../../src/mind.ts'
import { SECRETS_KEY, type Secret } from '../../src/secrets.ts'
import { toolRegistry } from '../../src/tools.ts'

const storage = new PostgresStore({ id: 'spike-storage', connectionString: config.databaseUrl, schemaName: 'spike', max: 3 })
const make = () => new Mastra({ storage, agents: { mind: mindAgent }, tools: { ...toolRegistry } })
const mastra = make()

const VALUE = `sk_test_${crypto.randomUUID()}`
const ctx = () => {
  const rc = new RequestContext()
  rc.set(MIND_KEY, mindSchema.parse({ templateId: 'general-assistant', name: 'Rex', soul: { identity: 'Always sign every reply with "— Rex".' }, skills: [] }))
  rc.set(SECRETS_KEY, new Map<string, Secret>([['HOOK', { name: 'HOOK', value: VALUE, allowedHosts: ['httpbin.org'] }]]))
  return rc
}
const log = (label: string, v: unknown) => console.log(`\n## ${label}\n${JSON.stringify(v, null, 2)?.slice(0, 1500)}`)

const obj = { type: 'object', properties: {} }
const main = await mastra.addDynamicWorkflow({
  id: 'spike-main',
  inputSchema: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] },
  outputSchema: { type: 'object', properties: { status: { type: 'number' } } },
  graph: [
    { type: 'mapping', id: 'm0', mapConfig: { } },
    { type: 'tool', id: 'now', toolId: 'get_time' },
    { type: 'mapping', id: 'm1', mapConfig: { prompt: { template: 'In one short sentence about ${initData.topic}, mention the time ${stepResults.now.utc}.' } } },
    { type: 'agent', id: 'write', agentId: 'mind' },
    { type: 'mapping', id: 'm2', mapConfig: { method: { value: 'POST' }, url: { value: 'https://httpbin.org/post' }, headers: { value: { 'X-Hook': '{{secrets.HOOK}}' } }, body: { template: '${stepResults.write.text}' } } },
    { type: 'tool', id: 'notify', toolId: 'http_request' },
  ],
} as any).then(() => 'registered', (e) => `REJECTED: ${e.message}`)
log('register main', main)

if (main === 'registered') {
  const run = await mastra.getWorkflow('spike-main').createRun()
  const out = run.stream({ inputData: { topic: 'NEAR' }, requestContext: ctx() })
  const types: string[] = []
  for await (const c of out as any) {
    types.push(c.type)
    if (c.type === 'workflow-step-start' || c.type === 'workflow-step-result') log(c.type, { ...c.payload, output: undefined, payload: undefined, keys: Object.keys(c.payload ?? {}) })
  }
  log('event types', types)
  const result: any = await out.result
  log('status', result.status)
  log('agent text (persona from RequestContext?)', result.steps?.write?.output)
  const notify = result.steps?.notify?.output
  log('http body contains raw secret?', String(JSON.stringify(notify)).includes(VALUE))
  log('http body shows redacted marker?', String(notify?.body).includes('••••'))
}

// B: a tool that requires approval, used as a workflow step.
const b = await mastra.addDynamicWorkflow({
  id: 'spike-approval', inputSchema: obj, outputSchema: obj,
  graph: [{ type: 'mapping', id: 'm', mapConfig: { to: { value: 'bob.testnet' }, amountUsdc: { value: 1 } } }, { type: 'tool', id: 'pay', toolId: 'demo_transfer' }],
} as any).then(() => 'registered', (e) => `REJECTED: ${e.message}`)
log('register approval', b)
if (b === 'registered') {
  const r: any = await (await mastra.getWorkflow('spike-approval').createRun()).start({ inputData: {}, requestContext: ctx() })
  log('approval tool step status / output', { status: r.status, pay: r.steps?.pay })
}

// C: conditional + mapping type flow (number into add_numbers).
const c = await mastra.addDynamicWorkflow({
  id: 'spike-cond', inputSchema: { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] }, outputSchema: obj,
  graph: [
    { type: 'mapping', id: 'm', mapConfig: { a: { initData: true, path: 'n' }, b: { value: 1 } } },
    { type: 'tool', id: 'sum', toolId: 'add_numbers' },
    { type: 'conditional', id: 'gate', steps: [{ type: 'tool', id: 'big', toolId: 'get_time' }, { type: 'tool', id: 'small', toolId: 'get_time' }],
      predicates: [{ op: 'gt', left: { path: 'inputData.sum' }, right: { literal: 10 } }, { op: 'not', arg: { op: 'gt', left: { path: 'inputData.sum' }, right: { literal: 10 } } }] },
  ],
} as any).then(() => 'registered', (e) => `REJECTED: ${e.message}`)
log('register cond', c)
if (c === 'registered') {
  for (const n of [3, 30]) {
    const r: any = await (await mastra.getWorkflow('spike-cond').createRun()).start({ inputData: { n }, requestContext: ctx() })
    log(`cond n=${n}`, { status: r.status, ran: Object.keys(r.steps ?? {}), result: r.result })
  }
}

// D: invalid references are rejected before storage.
log('unknown tool', await mastra.addDynamicWorkflow({ id: 'spike-bad', inputSchema: obj, outputSchema: obj, graph: [{ type: 'tool', id: 'x', toolId: 'nope' }] } as any).then(() => 'registered', (e) => `REJECTED: ${e.message}`))
log('type mismatch', await mastra.addDynamicWorkflow({ id: 'spike-bad2', inputSchema: obj, outputSchema: obj, graph: [{ type: 'mapping', id: 'm', mapConfig: { a: { value: 'x' }, b: { value: 1 } } }, { type: 'tool', id: 'x', toolId: 'add_numbers' }] } as any).then(() => 'registered', (e) => `REJECTED: ${e.message}`))

// E: a fresh instance (simulated restart) loads stored definitions.
const fresh = make()
await fresh.startWorkers()
let found: string
try { const r: any = await (await fresh.getWorkflow('spike-cond').createRun()).start({ inputData: { n: 30 }, requestContext: ctx() }); found = `found, ran: ${Object.keys(r.steps)}` } catch (e) { found = `missing: ${(e as Error).message}` }
log('after restart', found)
const rows = await (storage as any).db?.manyOrNone?.('select id from spike.mastra_workflow_definitions').catch((e: Error) => e.message)
log('stored rows', rows)
await fresh.stopWorkers?.()
process.exit(0)
