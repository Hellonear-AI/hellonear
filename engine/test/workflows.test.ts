// Visual Builder workflows (#20) end to end: real NEAR AI, local Postgres, NEAR testnet RPC and httpbin.
// Run: npm test   (needs engine/.env and `docker compose up -d postgres`)
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { server } from '../src/server.ts'
import { mastra } from '../src/mastra.ts'
import { mastraWorkflowId } from '../src/builder.ts'
import { balanceAlert } from './fixtures/canvas.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const mindId = `wf-${randomUUID().slice(0, 8)}`
const SECRET = `sk_test_${randomUUID()}`
const hook = [{ name: 'HOOK', value: SECRET, allowedHosts: ['httpbin.org'] }]
const account = 'hellonear-registry.testnet'

before(async () => {
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => new Promise<void>((r) => server.close(() => r())))

type Ev = Record<string, any>
const call = (method: string, path: string, body?: unknown) =>
  fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-engine-key': key }, body: body === undefined ? undefined : JSON.stringify(body) })
async function events(res: Response): Promise<Ev[]> {
  assert.equal(res.status, 200, await res.clone().text())
  return (await res.text()).split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}
const mind = (skills: string[]) => ({ templateId: 'general-assistant', name: 'Rex', soul: { identity: 'End every reply with "— Rex".' }, skills: skills.map((skillId) => ({ skillId })) })
const runBody = (skills = ['near-account', 'http-request']) => ({ userId: 'u1', mind: mind(skills), secrets: hook, input: { account } })
const path = (id: string, mid = mindId) => `/v1/minds/${mid}/workflows/${id}`
const ofType = (evs: Ev[], type: string) => evs.filter((e) => e.type === type)

describe('builder workflows', () => {
  test('save, list, load for the editor; other Minds cannot see it', async () => {
    const saved = await call('PUT', path('balance-alert'), balanceAlert())
    assert.equal(saved.status, 200, await saved.clone().text())
    const body = await saved.json()
    assert.deepEqual(body.tools, ['near_view_account', 'http_request'])
    assert.equal(body.schedule.cron, '0 * * * *')

    const list = await (await call('GET', `/v1/minds/${mindId}/workflows`)).json()
    assert.deepEqual(list.workflows.map((w: Ev) => w.workflowId), ['balance-alert'])
    const loaded = await (await call('GET', path('balance-alert'))).json()
    assert.deepEqual(loaded.canvas.nodes[0].position, { x: 0, y: 0 }, 'positions survive for the editor')

    assert.equal((await call('GET', path('balance-alert', 'someone-else'))).status, 404)
    assert.deepEqual((await (await call('GET', '/v1/minds/someone-else/workflows')).json()).workflows, [])
  })

  test('invalid canvases are rejected with issues; ids and auth are checked', async () => {
    const approval = balanceAlert()
    approval.nodes[1] = { id: 'balance', type: 'tool', data: { tool: 'demo_transfer', args: { to: 'bob.testnet', amountUsdc: 1 } } } as any
    const res = await call('PUT', path('bad'), approval)
    assert.equal(res.status, 400)
    assert.match(JSON.stringify((await res.json()).issues), /needs the owner's approval/)

    // Caught by Mastra's own validation: near_view_account returns no field "nope".
    const field = balanceAlert()
    ;(field.nodes[2].data as any).left = '{{steps.balance.nope}}'
    ;(field.nodes[3].data as any).body = '{{steps.balance.nope}}'
    const mastraCheck = await call('PUT', path('bad'), field)
    assert.equal(mastraCheck.status, 400, await mastraCheck.clone().text())
    assert.match(JSON.stringify(await mastraCheck.json()), /failed validation/)

    assert.equal((await call('PUT', path('Bad--Id'), balanceAlert())).status, 400)
    assert.equal((await fetch(base + path('balance-alert'))).status, 401)
    assert.equal((await call('GET', path('bad'))).status, 404, 'rejected canvases are not saved')
  })

  test('a Mind without the tools the workflow needs cannot run it', async () => {
    const res = await call('POST', `${path('balance-alert')}/runs`, runBody(['daily-planner']))
    assert.equal(res.status, 409)
    assert.deepEqual(await res.json(), { error: 'missing_tools', tools: ['near_view_account', 'http_request'] })
  })

  test('run: real testnet balance, condition true, notification sent with the secret redacted', async () => {
    const evs = await events(await call('POST', `${path('balance-alert')}/runs`, runBody()))
    assert.equal(evs[0].type, 'workflow.started')
    assert.equal(evs[0].nodeId, 'workflow:balance-alert')
    assert.deepEqual(evs.map((e) => e.seq), evs.map((_, i) => i), 'seq is 0, 1, 2…')
    assert.ok(evs.every((e) => e.runId === evs[0].runId && e.mindId === mindId))

    const finished = ofType(evs, 'node.finished')
    assert.deepEqual(finished.map((e) => [e.node, e.nodeType, e.nodeId, e.status]), [
      ['balance', 'tool', 'tool:near_view_account', 'ok'],
      ['notify', 'http', 'tool:http_request', 'ok'],
    ])
    assert.ok(finished[0].output.balanceNear > 0)
    assert.match(finished[1].output.body, /••••/, 'httpbin echoed the header, redacted')
    assert.match(finished[1].output.body, new RegExp(`${account.replace('.', '\\.')} has [0-9.]+ NEAR`))
    assert.ok(!JSON.stringify(evs).includes(SECRET), 'the secret value is in no event')

    assert.equal(ofType(evs, 'workflow.finished')[0].status, 'success')
    const last = evs.at(-1)!
    assert.equal(last.type, 'run.verified')
    assert.deepEqual(last.verification, { status: 'not_applicable', reason: 'no_completions' })

    // "Run again" is just a new run from the same input.
    const again = await events(await call('POST', `${path('balance-alert')}/runs`, runBody()))
    assert.notEqual(again[0].runId, evs[0].runId)
  })

  test('else branch runs the agent: chat events and the badge come through', async () => {
    const canvas = balanceAlert()
    ;(canvas.nodes[2].data as any).right = 0
    assert.equal((await call('PUT', path('balance-alert'), canvas)).status, 200, 'saving again replaces the workflow')
    const evs = await events(await call('POST', `${path('balance-alert')}/runs`, runBody()))
    assert.deepEqual(ofType(evs, 'node.started').map((e) => e.node), ['balance', 'chill'])
    const chill = ofType(evs, 'node.finished').find((e) => e.node === 'chill')!
    assert.equal(chill.nodeId, `mind:${mindId}`)
    assert.ok(chill.output.text.length > 0)
    assert.ok(ofType(evs, 'text.delta').length > 0, 'agent text streams')
    assert.equal(ofType(evs, 'run.started').length, 0, 'no second run.started from inside the agent step')
    assert.equal(evs.at(-1)!.type, 'run.verified')
    assert.equal(evs.at(-1)!.verification.status, 'verified')
  })

  test('agents inside a workflow never get approval tools', async () => {
    const canvas = {
      name: 'Pay',
      nodes: [{ id: 't', type: 'trigger', data: {} }, { id: 'ask', type: 'agent', data: { prompt: 'Use the demo_transfer tool to send 1 USDC to bob.testnet now, then say done.' } }],
      edges: [{ source: 't', target: 'ask' }],
    }
    assert.equal((await call('PUT', path('pay'), canvas)).status, 200)
    const evs = await events(await call('POST', `${path('pay')}/runs`, { userId: 'u1', mind: mind(['payments']), secrets: [] }))
    assert.ok(!evs.some((e) => e.tool === 'demo_transfer'), JSON.stringify(evs.filter((e) => e.tool)))
    assert.equal(ofType(evs, 'tool.approval_required').length, 0)
    assert.equal(ofType(evs, 'workflow.finished')[0].status, 'success')
  })

  test('saved workflows survive a restart', async () => {
    const id = mastraWorkflowId(mindId, 'balance-alert')
    // Same path as a restart: drop it from the live registry, then load from Postgres.
    assert.equal(mastra.removeWorkflow(id), true)
    await mastra.startWorkers()
    assert.equal(mastra.getWorkflow(id).id, id)
    await mastra.stopWorkers()
    // And if it is still missing (saved by another process), a run registers it from the stored canvas.
    mastra.removeWorkflow(id)
    const evs = await events(await call('POST', `${path('balance-alert')}/runs`, runBody()))
    assert.equal(ofType(evs, 'workflow.finished')[0].status, 'success')
  })

  test('delete removes it everywhere', async () => {
    for (const id of ['balance-alert', 'pay']) assert.equal((await call('DELETE', path(id))).status, 204)
    assert.equal((await call('GET', path('balance-alert'))).status, 404)
    assert.equal((await call('POST', `${path('balance-alert')}/runs`, runBody())).status, 404)
    assert.equal((await call('DELETE', path('balance-alert'))).status, 404)
  })
})
