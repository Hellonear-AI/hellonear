// Unit tests for auto-approve rules (#167): which calls skip the owner's approval (no network, no database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SWITCHABLE_TOOLS, autoApproveSchema, ruleFor } from '../src/autoApprove.ts'
import { needsApproval, toolRegistry } from '../src/tools.ts'
import { mindSchema } from '../src/mind.ts'

const rules = autoApproveSchema.parse({ tools: ['googlecalendar_create_event'], payment: { maxNear: '0.1', recipients: ['alice.testnet'] } })

test('a switch covers only its own tool', () => {
  assert.equal(ruleFor('googlecalendar_create_event', { title: 'x' }, { autoApprove: rules }), 'tool')
  assert.equal(ruleFor('mail_send', { to: ['a@b.c'] }, { autoApprove: rules }), null)
  assert.equal(ruleFor('googlecalendar_create_event', {}, {}), null, 'no rules: asks')
})

test('a payment skips the approval only up to maxNear and only to a listed account', () => {
  const pay = (to: string, amountNear: string) => ruleFor('send_payment', { to, amountNear }, { autoApprove: rules })
  assert.equal(pay('alice.testnet', '0.1'), 'payment')
  assert.equal(pay('alice.testnet', '0.05'), 'payment')
  assert.equal(pay('alice.testnet', '0.1000000000000000000001'), null, 'one yocto over the limit asks')
  assert.equal(pay('alice.testnet', '1'), null)
  assert.equal(pay('bob.testnet', '0.01'), null, 'not on the list: asks')
  assert.equal(pay('alice.testnet', 'nope'), null)
  assert.equal(ruleFor('send_payment', { to: 'alice.testnet', amountNear: '0.01' }, { autoApprove: { tools: [], payment: { maxNear: '1', recipients: [] } } }), null, 'empty list: asks')
  assert.equal(ruleFor('send_payment', { to: 'alice.testnet', amountNear: '0.01' }, { autoApprove: { tools: ['googlecalendar_create_event'] } }), null, 'no payment rule: asks')
})

test('try-outs and the Attack Playground (demo) always ask', () => {
  assert.equal(ruleFor('googlecalendar_create_event', {}, { autoApprove: rules, demo: true }), null)
  assert.equal(ruleFor('send_payment', { to: 'alice.testnet', amountNear: '0.01' }, { autoApprove: rules, demo: true }), null)
})

test('switches name approval tools only, never send_payment or a tool that does not ask', () => {
  const approvalTools = Object.keys(toolRegistry).filter(needsApproval)
  for (const t of SWITCHABLE_TOOLS) assert.ok(approvalTools.includes(t) || t === 'mail_send_to_owner', `${t} is an approval tool`)
  for (const t of approvalTools) assert.ok(t === 'send_payment' || (SWITCHABLE_TOOLS as readonly string[]).includes(t), `${t} has a switch`)
  assert.equal(autoApproveSchema.safeParse({ tools: ['send_payment'] }).success, false)
  assert.equal(autoApproveSchema.safeParse({ tools: ['http_request'] }).success, false)
  assert.equal(autoApproveSchema.safeParse({ payment: { maxNear: '0', recipients: [] } }).success, false)
})

test('every approval tool decides per call; without rules it still asks', async () => {
  for (const [k, tool] of Object.entries(toolRegistry) as [string, any][]) {
    if (!needsApproval(k)) continue
    assert.equal(typeof tool.needsApprovalFn, 'function', `${k} has needsApprovalFn`)
    assert.equal(await tool.needsApprovalFn({}, { requestContext: {} }), true, `${k} asks without rules`)
  }
  const pay = (toolRegistry as any).send_payment.needsApprovalFn
  const mind = mindSchema.parse({ templateId: 'payments-mind', name: 'P', soul: { identity: 'x' }, autoApprove: rules })
  assert.equal(await pay({ to: 'alice.testnet', amountNear: '0.01' }, { requestContext: { mind } }), false)
  assert.equal(await pay({ to: 'alice.testnet', amountNear: '0.01' }, { requestContext: { mind, demo: true } }), true)
  assert.equal(await pay({ to: 'alice.testnet', amountNear: '0.01' }, { requestContext: { mind, wallet: new Map([['failed', '1']]) } }), true, 'after a failed payment it goes to the gate')
})

test('the prompt tells the Mind its owner\'s rules, and says nothing without them', async () => {
  const { autoApproveLine, buildInstructions } = await import('../src/mind.ts')
  const base = { templateId: 'payments-mind', name: 'P', soul: { identity: 'x' } }
  assert.equal(autoApproveLine(mindSchema.parse(base)), '')
  const withRules = mindSchema.parse({ ...base, autoApprove: rules })
  const line = autoApproveLine(withRules)
  assert.match(line, /up to 0\.1 NEAR/)
  assert.match(line, /alice\.testnet/)
  assert.match(line, /googlecalendar_create_event/)
  assert.match(line, /do not say they approved it/)
  assert.ok(buildInstructions(withRules).includes(line))
})

test('demo and unattended runs (workflows, Autopilot) never see the rules in their prompt', async () => {
  const { autoApproveLine, buildInstructions, promptMind } = await import('../src/mind.ts')
  const mind = mindSchema.parse({ templateId: 'payments-mind', name: 'P', soul: { identity: 'x' }, autoApprove: rules })
  assert.ok(buildInstructions(promptMind(mind, true)).includes(autoApproveLine(mind)))
  assert.ok(!buildInstructions(promptMind(mind, false)).includes('without asking'))
})
