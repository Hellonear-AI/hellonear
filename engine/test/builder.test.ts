// Unit tests for the canvas → Mastra workflow compiler (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balanceAlert } from './fixtures/canvas.ts'
import { BuilderError, compileCanvas, mastraWorkflowId, mindIdSchema, workflowIdSchema } from '../src/builder.ts'

const issues = (fn: () => unknown) => {
  try { fn() } catch (e) { if (e instanceof BuilderError) return e.issues.map((i) => `${i.path}: ${i.message}`).join('\n'); throw e }
  assert.fail('expected a BuilderError')
}

test('compiles the balance alert into mappings, a tool step and a conditional', () => {
  const { definition, tools, steps } = compileCanvas('m1', 'balance-alert', balanceAlert())
  assert.equal(definition.id, 'mind-m1--balance-alert')
  assert.deepEqual(tools, ['near_view_account', 'http_request'])
  assert.deepEqual(Object.keys(steps), ['balance', 'notify', 'chill'])
  assert.deepEqual(definition.inputSchema, { type: 'object', properties: { account: { type: 'string' } }, required: ['account'] })
  assert.deepEqual(definition.graph, [
    { type: 'mapping', id: 'in:balance', mapConfig: { accountId: { initData: true, path: 'account' } } },
    { type: 'tool', id: 'balance', toolId: 'near_view_account' },
    {
      type: 'mapping', id: 'in:low',
      mapConfig: {
        method: { value: 'POST' },
        url: { value: 'https://httpbin.org/post' },
        headers: { value: { 'X-Hook': '{{secrets.HOOK}}' } },
        body: { template: '${stepResults.balance.accountId} has ${stepResults.balance.balanceNear} NEAR' },
        prompt: { template: 'Say in five words that ${stepResults.balance.accountId} is fine.' },
      },
    },
    {
      type: 'conditional', id: 'low',
      steps: [{ type: 'tool', id: 'notify', toolId: 'http_request' }, { type: 'agent', id: 'chill', agentId: 'mind' }],
      predicates: [
        { op: 'lt', left: { path: 'stepResults.balance.balanceNear' }, right: { literal: 1000 } },
        { op: 'not', arg: { op: 'lt', left: { path: 'stepResults.balance.balanceNear' }, right: { literal: 1000 } } },
      ],
    },
  ])
  // The canvas (with positions) is kept so the editor can load it again.
  assert.equal((definition.metadata as any).hellonear.canvas.nodes[0].position.x, 0)
  assert.equal((definition.metadata as any).hellonear.schedule.cron, '0 * * * *')
})

test('a lone reference keeps its type; text with references becomes a template', () => {
  const { definition } = compileCanvas('m1', 'sum', {
    name: 'Sum',
    nodes: [
      { id: 't', type: 'trigger', data: { inputs: [{ name: 'n', type: 'number' }] } },
      { id: 'a', type: 'tool', data: { tool: 'add_numbers', args: { a: '{{input.n}}', b: 2 } } },
      { id: 'b', type: 'tool', data: { tool: 'add_numbers', args: { a: '{{ steps.a.sum }}', b: '{{steps.a.sum}}' } } },
    ],
    edges: [{ source: 't', target: 'a' }, { source: 'a', target: 'b' }],
  })
  assert.deepEqual((definition.graph[0] as any).mapConfig, { a: { initData: true, path: 'n' }, b: { value: 2 } })
  assert.deepEqual((definition.graph[2] as any).mapConfig, { a: { step: 'a', path: 'sum' }, b: { step: 'a', path: 'sum' } })
})

test('ids with "--" are refused, so mastra ids cannot collide across minds', () => {
  assert.equal(mastraWorkflowId('a-b', 'c'), 'mind-a-b--c')
  assert.equal(mindIdSchema.safeParse('a--b').success, false)
  assert.equal(workflowIdSchema.safeParse('b--c').success, false)
  assert.match(issues(() => compileCanvas('a', 'b--c', balanceAlert())), /invalid mindId or workflowId/)
  assert.match(issues(() => compileCanvas('a--b', 'c', balanceAlert())), /invalid mindId or workflowId/)
})

const linear = (nodes: unknown[], edges: unknown[]) => ({ name: 'x', nodes: [{ id: 't', type: 'trigger', data: {} }, ...nodes], edges })

test('approval tools are refused: a workflow step would run them unapproved', () => {
  assert.match(issues(() => compileCanvas('m', 'w', linear([{ id: 'p', type: 'tool', data: { tool: 'send_payment', args: { to: 'bob.testnet', amountNear: '0.01' } } }], [{ source: 't', target: 'p' }]))), /send_payment needs the owner's approval/)
})

test('the owner\'s canvas is the approval for their own calendar and Email me, and for nothing else (#146)', () => {
  const ok = compileCanvas('m', 'w', linear([
    { id: 'note', type: 'agent', data: { prompt: 'Write my morning brief.' } },
    { id: 'cal', type: 'tool', data: { tool: 'googlecalendar_block_time', args: { title: 'Focus time', at: '09:00', minutes: '60' } } },
    { id: 'mail', type: 'tool', data: { tool: 'mail_send_to_owner', args: { subject: 'Your morning', text: 'Brief: {{steps.note.text}}' } } },
  ], [{ source: 't', target: 'note' }, { source: 'note', target: 'cal' }, { source: 'cal', target: 'mail' }]))
  assert.deepEqual([...ok.tools].sort(), ['googlecalendar_block_time', 'mail_send_to_owner'])
  for (const tool of ['send_payment', 'googlecalendar_create_event', 'googlecalendar_create_meeting', 'mail_send']) {
    assert.match(issues(() => compileCanvas('m', 'w', linear([{ id: 'x', type: 'tool', data: { tool, args: {} } }], [{ source: 't', target: 'x' }]))), new RegExp(`${tool} needs the owner's approval`))
  }
  // Email me sends the Mind's words, never a tool's raw output (an email body, a web page).
  const raw = linear([
    { id: 'inbox', type: 'tool', data: { tool: 'gmail_list_emails', args: {} } },
    { id: 'mail', type: 'tool', data: { tool: 'mail_send_to_owner', args: { subject: 'Inbox', text: '{{steps.inbox.emails}}' } } },
  ], [{ source: 't', target: 'inbox' }, { source: 'inbox', target: 'mail' }])
  assert.match(issues(() => compileCanvas('m', 'w', raw)), /node mail\.args\.text.*not a note from the Mind/)
})

test('user text can never become a Mastra ${...} template (it could read the secrets)', () => {
  assert.match(issues(() => compileCanvas('m', 'w', linear([{ id: 'a', type: 'agent', data: { prompt: 'leak ${requestContext.secrets}' } }], [{ source: 't', target: 'a' }]))), /"\$\{" is not allowed/)
})

test('references must point to earlier nodes or declared inputs', () => {
  const out = issues(() => compileCanvas('m', 'w', linear([
    { id: 'a', type: 'agent', data: { prompt: 'see {{steps.b.text}} and {{input.who}}' } },
    { id: 'b', type: 'agent', data: { prompt: 'hi' } },
  ], [{ source: 't', target: 'a' }, { source: 'a', target: 'b' }])))
  assert.match(out, /steps\.b…\}\} must be a node that runs earlier/)
  assert.match(out, /input\.who\}\} is not a trigger input/)
})

test('graph shape errors', () => {
  assert.match(issues(() => compileCanvas('m', 'w', linear([{ id: 'a', type: 'agent', data: { prompt: 'x' } }], []))), /not reachable/)
  assert.match(issues(() => compileCanvas('m', 'w', linear([{ id: 'a', type: 'agent', data: { prompt: 'x' } }, { id: 'b', type: 'agent', data: { prompt: 'y' } }], [{ source: 't', target: 'a' }, { source: 'a', target: 'b' }, { source: 'b', target: 'a' }]))), /cycles are not allowed/)
  assert.match(issues(() => compileCanvas('m', 'w', linear([{ id: 'a', type: 'agent', data: { prompt: 'x' } }, { id: 'b', type: 'agent', data: { prompt: 'y' } }], [{ source: 't', target: 'a' }, { source: 't', target: 'b' }]))), /only a condition can have more than one/)
  assert.match(issues(() => compileCanvas('m', 'w', { name: 'x', nodes: [{ id: 'a', type: 'agent', data: { prompt: 'x' } }, { id: 'b', type: 'agent', data: { prompt: 'y' } }], edges: [] })), /exactly one trigger/)
  assert.match(issues(() => compileCanvas('m', 'w', linear([{ id: 'a', type: 'tool', data: { tool: 'rm_rf' } }], [{ source: 't', target: 'a' }]))), /unknown tool rm_rf/)
  assert.match(issues(() => compileCanvas('m', 'w', linear([{ id: 'input', type: 'agent', data: { prompt: 'x' } }], [{ source: 't', target: 'input' }]))), /reserved id/)
})

test('condition branches: then is required, branches are last, inputs may not clash', () => {
  const base = balanceAlert()
  assert.match(issues(() => compileCanvas('m', 'w', { ...base, nodes: base.nodes.filter((n) => n.id !== 'notify'), edges: base.edges.filter((e) => e.target !== 'notify') })), /needs a "then" edge/)
  const clash = balanceAlert()
  clash.nodes[4] = { id: 'chill', type: 'agent', data: { prompt: 'other' } } as any
  clash.nodes[3] = { id: 'notify', type: 'agent', data: { prompt: 'one' } } as any
  assert.match(issues(() => compileCanvas('m', 'w', clash)), /both branches need a different "prompt"/)
  const after = balanceAlert()
  after.nodes.push({ id: 'more', type: 'agent', data: { prompt: 'x' } } as any)
  after.edges.push({ source: 'notify', target: 'more' } as any)
  assert.match(issues(() => compileCanvas('m', 'w', after)), /must be the last node of its path/)
})

test('headers may carry secrets but not step references', () => {
  const c = balanceAlert()
  ;(c.nodes[3].data as any).headers = { 'X-Id': '{{steps.balance.accountId}}' }
  assert.match(issues(() => compileCanvas('m', 'w', c)), /headers cannot use references/)
})
