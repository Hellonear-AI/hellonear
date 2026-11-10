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
})

test('an If way can be a chain of steps, compiled as a nested workflow with its own mappings (#153)', () => {
  const c = balanceAlert()
  // Yes: notify, then a note that reads notify's answer and the balance from before the If.
  c.nodes.push({ id: 'note', type: 'agent', data: { prompt: 'Website said {{steps.notify.status}}; {{steps.balance.accountId}} has {{steps.balance.balanceNear}} NEAR.' } } as any)
  c.edges.push({ source: 'notify', target: 'note' } as any)
  const out = compileCanvas('m', 'w', c)
  assert.equal(out.children.length, 1)
  const child = out.children[0]
  assert.equal(child.id, 'mind-m--w--then')
  assert.deepEqual(child.graph.map((g: any) => g.id), ['in:notify', 'notify', 'in:note', 'note'])
  // Values from before the If arrive as then_pN inputs (p0 = accountId, p1 = balanceNear); notify's own answer stays a step reference inside the way.
  const noteMap = (child.graph[2] as any).mapConfig
  assert.equal(noteMap.prompt.template, 'Website said ${stepResults.notify.status}; ${initData.then_p0} has ${initData.then_p1} NEAR.')
  assert.deepEqual((child.graph[0] as any).mapConfig.body, { template: '${initData.then_p0} has ${initData.then_p1} NEAR' })
  const cond = out.definition.graph.at(-1) as any
  assert.deepEqual(cond.steps[0], { type: 'workflow', id: 'way-then', workflowId: 'mind-m--w--then' })
  assert.deepEqual(cond.steps[1], { type: 'agent', id: 'chill', agentId: 'mind' })
  const shared = (out.definition.graph.at(-2) as any).mapConfig
  assert.deepEqual(shared.then_p0, { step: 'balance', path: 'accountId' })
  assert.deepEqual(shared.then_p1, { step: 'balance', path: 'balanceNear' })
  // Events arrive as way-then.<node>; the way's own entry carries its last node for run history.
  assert.equal(out.steps['way-then.notify'].node, 'notify')
  assert.equal(out.steps['way-then.note'].node, 'note')
  assert.deepEqual(out.steps['way-then'], { node: 'note', type: 'agent', way: true })
  assert.equal(out.steps.notify, undefined)
  // Two Asks are fine now: each way of more than one step has its own mapping.
  const two = balanceAlert()
  two.nodes[3] = { id: 'notify', type: 'agent', data: { prompt: 'one' } } as any
  two.nodes.push({ id: 'note', type: 'agent', data: { prompt: 'two' } } as any)
  two.edges.push({ source: 'notify', target: 'note' } as any)
  assert.equal(compileCanvas('m', 'w', two).children.length, 1)
})

test('If way chains: no reference across ways, no fork inside a way (#153)', () => {
  const across = balanceAlert()
  across.nodes.push({ id: 'note', type: 'agent', data: { prompt: '{{steps.chill.text}}' } } as any)
  across.edges.push({ source: 'notify', target: 'note' } as any)
  assert.match(issues(() => compileCanvas('m', 'w', across)), /steps\.chill…\}\} must be a node that runs earlier/)
  const fork = balanceAlert()
  fork.nodes.push({ id: 'x', type: 'agent', data: { prompt: 'x' } } as any, { id: 'y', type: 'agent', data: { prompt: 'y' } } as any)
  fork.edges.push({ source: 'notify', target: 'x' } as any, { source: 'notify', target: 'y' } as any)
  assert.match(issues(() => compileCanvas('m', 'w', fork)), /can have only one next step/)
  // An If inside a way is allowed since #164 (see the tree tests below).
  // Email me inside a way still refuses raw tool output, and accepts the way's own note.
  const mail = balanceAlert()
  mail.nodes.push({ id: 'mail', type: 'tool', data: { tool: 'mail_send_to_owner', args: { subject: 'x', text: '{{steps.notify.body}}' } } } as any)
  mail.edges.push({ source: 'notify', target: 'mail' } as any)
  assert.match(issues(() => compileCanvas('m', 'w', mail)), /not a note from the Mind/)
})

test('headers may carry secrets but not step references', () => {
  const c = balanceAlert()
  ;(c.nodes[3].data as any).headers = { 'X-Id': '{{steps.balance.accountId}}' }
  assert.match(issues(() => compileCanvas('m', 'w', c)), /headers cannot use references/)
})

// #164: Ifs anywhere and End where the user puts it. The doc example from the issue, smaller: the balance, an If in
// the middle of the main line, a nested If on the yes way, End on one path, and a step after the If for the rest.
const tree = () => ({
  name: 'Tree',
  nodes: [
    { id: 't', type: 'trigger', data: { inputs: [{ name: 'account', type: 'string' }] } },
    { id: 'bal', type: 'tool', data: { tool: 'near_view_account', args: { accountId: '{{input.account}}' } } },
    { id: 'low', type: 'condition', data: { left: '{{steps.bal.balanceNear}}', op: 'lt', right: 10 } },
    { id: 'very', type: 'condition', data: { left: '{{steps.bal.balanceNear}}', op: 'lt', right: 2 } },
    { id: 'urgent', type: 'agent', data: { prompt: 'Urgent: {{steps.bal.accountId}} has {{steps.bal.balanceNear}} NEAR.' } },
    { id: 'stop', type: 'end', data: {} },
    { id: 'warn', type: 'agent', data: { prompt: 'Warn about {{input.account}}.' } },
    { id: 'clock', type: 'tool', data: { tool: 'get_time', args: {} } },
    { id: 'wrap', type: 'agent', data: { prompt: 'At {{steps.clock.time}}, sum up {{steps.bal.accountId}}.' } },
  ],
  edges: [
    { source: 't', target: 'bal' }, { source: 'bal', target: 'low' },
    { source: 'low', target: 'very', sourceHandle: 'then' },
    { source: 'very', target: 'urgent', sourceHandle: 'then' }, { source: 'urgent', target: 'stop' },
    { source: 'very', target: 'warn', sourceHandle: 'else' },
    { source: 'low', target: 'clock' }, { source: 'clock', target: 'wrap' },
  ],
})

test('Ifs anywhere and End (#164): nested ways, a gate for the steps after an If, End leaves no way to carry on', () => {
  const out = compileCanvas('m', 'w', tree())
  const g = out.definition.graph as any[]
  assert.deepEqual(g.map((e) => e.id), ['in:bal', 'bal', 'in:low', 'low', 'in:low:next', 'low:gate'])
  const ids = out.children.map((c) => c.id.split('--').slice(2).join('--')).sort()
  assert.deepEqual(ids, ['low.else', 'low.next', 'low.then', 'very.else', 'very.then'])
  // The gate runs the steps after "low" only if the way that ran carried on. The yes way of "low" is the nested If
  // "very": its yes way ends (End), so only its no way, and the empty no way of "low", can carry on.
  assert.deepEqual(g[5].predicates[0], { op: 'or', args: [
    { op: 'truthy', value: { path: 'stepResults.low:then.very:else.continues' } },
    { op: 'truthy', value: { path: 'stepResults.low:else.continues' } },
  ] })
  const byId = (slug: string) => out.children.find((c) => c.id.endsWith(`--${slug}`))! as any
  const veryThen = byId('very.then')
  assert.deepEqual(veryThen.graph.map((e: any) => e.id), ['in:urgent', 'urgent', 'out'])
  assert.deepEqual(veryThen.graph[2].mapConfig.continues, { value: false })
  // Values from the main line reach two levels down through each parent's mapping.
  assert.match(veryThen.graph[0].mapConfig.prompt.template, /^Urgent: \$\{initData\.very_then_p0\} has \$\{initData\.very_then_p1\} NEAR\.$/)
  const lowThen = byId('low.then')
  assert.deepEqual(Object.keys(lowThen.graph[0].mapConfig).sort(), ['very_else_p0', 'very_then_p0', 'very_then_p1'])
  // The steps after the If read the main line through the gate's mapping, and their own clock locally.
  const next = byId('low.next')
  assert.match(next.graph[2].mapConfig.prompt.template, /^At \$\{stepResults\.clock\.time\}, sum up \$\{initData\.low_next_p0\}\.$/)
  // Events of nested steps arrive as <path>.<node>.
  assert.equal(out.steps['low:then.very:then.urgent'].node, 'urgent')
  assert.equal(out.steps['low:next.wrap'].node, 'wrap')
  assert.equal(out.steps['low:then'].way, true)
  // Children are registered deepest first, so each parent finds its children.
  const order = out.children.map((c) => c.id.split('--').slice(2).join('--'))
  assert.ok(order.indexOf('very.then') < order.indexOf('low.then'))
})

test('Ifs anywhere (#164): no joins, no steps after an If whose ways both end, End has no next step', () => {
  const join = tree()
  join.edges.push({ source: 'warn', target: 'clock' } as any)
  assert.match(issues(() => compileCanvas('m', 'w', join)), /used twice; paths cannot join/)
  const dead = tree()
  dead.nodes.push({ id: 'stop2', type: 'end', data: {} } as any)
  dead.edges.push({ source: 'warn', target: 'stop2' } as any, { source: 'low', target: 'stop3', sourceHandle: 'else' } as any)
  dead.nodes.push({ id: 'stop3', type: 'end', data: {} } as any)
  assert.match(issues(() => compileCanvas('m', 'w', dead)), /both ways end, so the steps after this If never run/)
  const endNext = tree()
  endNext.edges.push({ source: 'stop', target: 'warn' } as any)
  assert.match(issues(() => compileCanvas('m', 'w', endNext)), /End cannot have a next step|used twice/)
  // A sibling way's step is not on this path.
  const sibling = tree()
  ;(sibling.nodes.find((n) => n.id === 'warn') as any).data.prompt = '{{steps.urgent.text}}'
  assert.match(issues(() => compileCanvas('m', 'w', sibling)), /steps\.urgent…\}\} must be a node that runs earlier on this path/)
})
