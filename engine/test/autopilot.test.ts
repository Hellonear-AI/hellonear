// Autopilot (#21) end to end: a real scheduler fire, real NEAR AI, local Postgres, NEAR testnet RPC.
// Run: bun run test   (needs engine/.env and `docker compose up -d postgres`). Waits for one cron minute.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { server } from '../src/server.ts'
import { mastra } from '../src/mastra.ts'
import { mastraWorkflowId } from '../src/builder.ts'
import { balanceAlert, balanceReport } from './fixtures/canvas.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const mindId = `ap-${randomUUID().slice(0, 8)}`
const account = 'hellonear-registry.testnet'

before(async () => {
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  // The scheduler only ticks after startWorkers(), as in the server's main block.
  await mastra.startWorkers()
})
after(async () => {
  await mastra.stopWorkers()
  await new Promise<void>((r) => server.close(() => r()))
})

type Ev = Record<string, any>
const call = (method: string, path: string, body?: unknown) =>
  fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-engine-key': key }, body: body === undefined ? undefined : JSON.stringify(body) })
const path = (id: string) => `/v1/minds/${mindId}/workflows/${id}`
const penny = (skills = ['payments', 'near-account']) => ({ templateId: 'payments-mind', name: 'Penny', soul: { identity: 'Always end every reply with "[Penny]".' }, skills: skills.map((skillId) => ({ skillId })) })
const on = (body: Record<string, unknown> = {}) => ({ userId: 'u1', mind: penny(), input: { account }, ...body })
const json = async (res: Response, status: number) => {
  const text = await res.text()
  assert.equal(res.status, status, text)
  return text ? JSON.parse(text) : null
}

describe('autopilot', () => {
  test('refuses what cannot run unattended, and says why', async () => {
    await json(await call('PUT', path('report'), balanceReport()), 200)
    const codes = async (body: unknown, id = 'report') => (await json(await call('PUT', `${path(id)}/autopilot`, body), 409)).issues.map((i: Ev) => i.code)
    assert.deepEqual(await codes(on({ mind: penny(['daily-planner']) })), ['missing_tools'])
    assert.deepEqual(await codes(on({ input: {} })), ['invalid_input'])
    assert.deepEqual(await codes(on({ input: { account: 7 } })), ['invalid_input'])
    // Secrets would be stored in the schedule as plain JSON.
    await json(await call('PUT', path('alert'), balanceAlert()), 200)
    assert.deepEqual(await codes(on({ mind: penny(['near-account', 'http-request']) }), 'alert'), ['uses_secrets'])
    const noCron = balanceReport()
    delete (noCron.nodes[0].data as Ev).schedule
    await json(await call('PUT', path('manual'), noCron), 200)
    assert.deepEqual(await codes(on(), 'manual'), ['no_schedule'])
    const mars = balanceReport()
    ;(mars.nodes[0].data as Ev).schedule.timezone = 'Mars/Olympus_Mons'
    await json(await call('PUT', path('mars'), mars), 200)
    assert.deepEqual(await codes(on(), 'mars'), ['invalid_schedule'])
    assert.equal((await call('DELETE', path('mars'))).status, 204)
    assert.deepEqual(await json(await call('GET', `${path('report')}/autopilot`), 200), { autopilot: null }, 'nothing was created')
    assert.equal((await call('PUT', `${path('nope')}/autopilot`, on())).status, 404)
  })

  test('a scheduled fire runs with the stored Mind config and shows up in the history', async () => {
    const { autopilot } = await json(await call('PUT', `${path('report')}/autopilot`, on()), 200)
    assert.equal(autopilot.status, 'active')
    assert.equal(autopilot.timezone, 'UTC')
    assert.ok(Date.parse(autopilot.nextFireAt) - Date.now() <= 60_000, autopilot.nextFireAt)
    // The stored context names the user (their Composio apps) and the Mind (Email me, #146); never a token.
    const [stored] = (await mastra.schedules.list({ workflowId: mastraWorkflowId(mindId, 'report') })) as { requestContext?: Record<string, unknown> }[]
    assert.deepEqual([stored.requestContext?.userId, stored.requestContext?.mindId], ['u1', mindId])
    assert.doesNotMatch(JSON.stringify(stored.requestContext), /mt_|wt_|secret/i)

    // Wait for the cron minute plus the run (one RPC call, one model call).
    let run: Ev | undefined
    for (const deadline = Date.now() + 150_000; !run && Date.now() < deadline; await new Promise((r) => setTimeout(r, 3000))) {
      const { runs } = await json(await call('GET', `${path('report')}/runs`), 200)
      run = runs.find((r: Ev) => r.trigger === 'autopilot' && r.status !== 'running')
    }
    assert.ok(run, 'a scheduled run finished within 150 s')
    assert.equal(run.status, 'success', JSON.stringify(run))
    assert.deepEqual(run.nodes.map((n: Ev) => [n.node, n.nodeType, n.nodeId, n.status]), [
      ['balance', 'tool', 'tool:near_view_account', 'ok'],
      ['report', 'agent', `mind:${mindId}`, 'ok'],
    ])
    assert.ok(run.nodes[0].output.balanceNear > 0)
    assert.match(run.nodes[1].output.text, /Penny/, 'the persona came from the schedule, not from a request')

    // The cron may have fired again while the first run was finishing, so compare times, not ids.
    const after = (await json(await call('GET', `${path('report')}/autopilot`), 200)).autopilot
    assert.match(after.lastRunId, /^sched_/)
    assert.ok(Date.parse(after.lastFireAt) >= Date.parse(run.startedAt) - 1000, JSON.stringify({ after, run: run.startedAt }))
  })

  test('manual runs share the history; limit works', async () => {
    // Off first, so no cron fire lands in the middle of this test.
    const off = (await json(await call('PUT', `${path('report')}/autopilot`, on({ enabled: false })), 200)).autopilot
    assert.equal(off.status, 'paused')
    assert.equal(off.nextFireAt, null)
    const res = await call('POST', `${path('report')}/runs`, { userId: 'u1', mind: penny(), input: { account } })
    assert.equal(res.status, 200)
    await res.text()
    const { runs } = await json(await call('GET', `${path('report')}/runs?limit=1`), 200)
    assert.equal(runs.length, 1)
    assert.equal(runs[0].trigger, 'manual', 'newest first')
  })

  test('saving the canvas again follows the new cron, or pauses when it can no longer run unattended', async () => {
    assert.equal((await json(await call('PUT', path('report'), balanceReport('*/5 * * * *')), 200)).autopilot.cron, '*/5 * * * *')
    const withSecret = balanceReport('*/5 * * * *')
    withSecret.nodes.push({ id: 'notify', type: 'http', data: { method: 'POST', url: 'https://httpbin.org/post', headers: { 'X-Hook': '{{secrets.HOOK}}' }, body: '{{steps.report.text}}' } } as never)
    withSecret.edges.push({ source: 'report', target: 'notify' })
    const paused = (await json(await call('PUT', path('report'), withSecret), 200)).autopilot
    assert.equal(paused.status, 'paused')
    assert.equal(paused.nextFireAt, null)
    assert.ok(paused.pausedFor.some((i: Ev) => i.code === 'uses_secrets'), JSON.stringify(paused.pausedFor))

    await json(await call('PUT', path('report'), balanceReport('*/5 * * * *')), 200)
    assert.equal((await json(await call('PUT', `${path('report')}/autopilot`, on()), 200)).autopilot.status, 'active', 'turned on again')
    // A Mind that lost a tool pauses the running schedule instead of keeping the old config.
    const lost = await json(await call('PUT', `${path('report')}/autopilot`, on({ mind: penny(['daily-planner']) })), 409)
    assert.equal(lost.autopilot.status, 'paused')
  })

  test('turning off and deleting the workflow remove the schedule', async () => {
    assert.equal((await call('DELETE', `${path('report')}/autopilot`)).status, 204)
    assert.equal((await call('DELETE', `${path('report')}/autopilot`)).status, 404)
    await json(await call('PUT', `${path('report')}/autopilot`, on()), 200)
    for (const id of ['report', 'alert', 'manual']) assert.equal((await call('DELETE', path(id))).status, 204)
    assert.deepEqual(await mastra.schedules.list({ workflowId: mastraWorkflowId(mindId, 'report') }), [])
  })
})
