// Visual Builder (#20): compiles a canvas (React Flow style nodes + edges) into a Mastra
// dynamic workflow definition. Pure functions, no network or database.
//
// Shape of a canvas: a trigger, then a chain of action nodes, optionally ending in one
// condition whose `then` / `else` edges each lead to a single action node.
// Facts this relies on are in spikes/02-dynamic-workflow/README.md (measured 3 Nov 2026).
import { z } from 'zod'
import { needsApproval, toolRegistry } from './tools.ts'

export const MAX_NODES = 20
const nodeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'letters, digits, - and _ only').refine((id) => id !== 'input', 'reserved id')
export const workflowIdSchema = z.string().max(48).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase words joined by single dashes')
// No "--" in either id, so mastraWorkflowId never collides across Minds.
export const mindIdSchema = z.string().max(64).regex(/^[A-Za-z0-9_]+(-[A-Za-z0-9_]+)*$/, 'letters, digits and _ joined by single dashes')

const literal = z.union([z.string().max(4000), z.number(), z.boolean(), z.null()])
const position = z.object({ x: z.number(), y: z.number() }).optional()

const trigger = z.object({
  id: nodeId, type: z.literal('trigger'), position,
  data: z.object({
    // Cron schedules are stored now and run by Autopilot (#21).
    schedule: z.object({ cron: z.string().regex(/^\S+( \S+){4}$/, 'five cron fields'), timezone: z.string().optional() }).optional(),
    inputs: z.array(z.object({ name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,31}$/), type: z.enum(['string', 'number', 'boolean']) })).max(10).default([]),
  }),
})
const agentNode = z.object({ id: nodeId, type: z.literal('agent'), position, data: z.object({ prompt: z.string().min(1).max(4000) }) })
const toolNode = z.object({ id: nodeId, type: z.literal('tool'), position, data: z.object({ tool: z.string(), args: z.record(z.string(), literal).default({}) }) })
const httpNode = z.object({
  id: nodeId, type: z.literal('http'), position,
  data: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    url: z.string().min(1).max(2000),
    headers: z.record(z.string(), z.string().max(2000)).optional(),
    body: z.string().max(4000).optional(),
  }),
})
const conditionNode = z.object({
  id: nodeId, type: z.literal('condition'), position,
  data: z.object({ left: z.string(), op: z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte']), right: literal }),
})
const node = z.discriminatedUnion('type', [trigger, agentNode, toolNode, httpNode, conditionNode])
const edge = z.object({ id: z.string().optional(), source: nodeId, target: nodeId, sourceHandle: z.enum(['then', 'else']).nullish() })

export const canvasSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  nodes: z.array(node).min(2).max(MAX_NODES),
  edges: z.array(edge).max(MAX_NODES * 2),
})
export type Canvas = z.infer<typeof canvasSchema>
type Node = Canvas['nodes'][number]
type ActionNode = Extract<Node, { type: 'agent' | 'tool' | 'http' }>

export class BuilderError extends Error {
  constructor(readonly issues: { path: string; message: string }[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join('; '))
  }
}

// Mastra workflow id for a Mind's workflow. Workflow ids never contain "--", so the split is unambiguous.
export const mastraWorkflowId = (mindId: string, workflowId: string) => `mind-${mindId}--${workflowId}`

// References users can write in any text field. {{secrets.NAME}} is left alone: tools fill it.
const REF = /\{\{\s*(steps\.([A-Za-z0-9_-]+)|input)\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g
const ONLY_REF = new RegExp(`^${REF.source}$`)

type Descriptor = { value: unknown } | { template: string } | { step: string; path: string } | { initData: true; path: string }
type Scope = { steps: Set<string>; inputs: Set<string> }

export type CompiledWorkflow = {
  definition: Record<string, unknown> & { id: string; graph: unknown[] }
  // Registry keys of every tool the workflow calls; the Mind must have all of them to run it.
  tools: string[]
  // Mastra step id → canvas node, for events and the Mind Graph.
  steps: Record<string, { node: string; type: ActionNode['type']; tool?: string }>
}

export function compileCanvas(mindId: string, workflowId: string, input: unknown): CompiledWorkflow {
  if (!mindIdSchema.safeParse(mindId).success || !workflowIdSchema.safeParse(workflowId).success) throw new BuilderError([{ path: 'id', message: 'invalid mindId or workflowId' }])
  const parsed = canvasSchema.safeParse(input)
  if (!parsed.success) throw new BuilderError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
  const canvas = parsed.data
  const issues: { path: string; message: string }[] = []
  const fail = (path: string, message: string) => issues.push({ path, message })

  const byId = new Map<string, Node>()
  canvas.nodes.forEach((n, i) => (byId.has(n.id) ? fail(`nodes.${i}.id`, `duplicate node id ${n.id}`) : byId.set(n.id, n)))
  canvas.edges.forEach((e, i) => {
    if (!byId.has(e.source)) fail(`edges.${i}.source`, `unknown node ${e.source}`)
    if (!byId.has(e.target)) fail(`edges.${i}.target`, `unknown node ${e.target}`)
  })
  const triggers = canvas.nodes.filter((n) => n.type === 'trigger')
  if (triggers.length !== 1) fail('nodes', 'exactly one trigger node is required')
  if (issues.length) throw new BuilderError(issues)

  const out = (id: string) => canvas.edges.filter((e) => e.source === id)
  const into = (id: string) => canvas.edges.filter((e) => e.target === id)
  const start = triggers[0] as Extract<Node, { type: 'trigger' }>
  if (into(start.id).length) fail(`node ${start.id}`, 'the trigger cannot have incoming edges')

  // Walk the chain from the trigger.
  const chain: ActionNode[] = []
  let condition: Extract<Node, { type: 'condition' }> | undefined
  const branches: { handle: 'then' | 'else'; node: ActionNode }[] = []
  const seen = new Set([start.id])
  let current: Node = start
  for (;;) {
    const next = out(current.id)
    if (current.type === 'condition') {
      for (const e of next) {
        const target = byId.get(e.target)!
        if (!e.sourceHandle) fail(`node ${current.id}`, 'condition edges need sourceHandle "then" or "else"')
        else if (branches.some((b) => b.handle === e.sourceHandle)) fail(`node ${current.id}`, `more than one "${e.sourceHandle}" edge`)
        else if (target.type === 'trigger' || target.type === 'condition') fail(`node ${target.id}`, 'a condition branch must be an agent, tool or http node')
        else if (out(target.id).length) fail(`node ${target.id}`, 'a condition branch must be the last node of its path')
        else if (seen.has(target.id)) fail(`node ${target.id}`, 'used twice')
        else { seen.add(target.id); branches.push({ handle: e.sourceHandle, node: target }) }
      }
      if (!branches.some((b) => b.handle === 'then')) fail(`node ${current.id}`, 'a condition needs a "then" edge')
      break
    }
    if (next.length === 0) break
    if (next.length > 1) { fail(`node ${current.id}`, 'only a condition can have more than one outgoing edge'); break }
    const target = byId.get(next[0].target)!
    if (seen.has(target.id)) { fail(`node ${target.id}`, 'cycles are not allowed'); break }
    if (target.type === 'trigger') { fail(`node ${target.id}`, 'the trigger cannot have incoming edges'); break }
    seen.add(target.id)
    if (target.type === 'condition') condition = target
    else chain.push(target)
    current = target
  }
  for (const n of canvas.nodes) if (!seen.has(n.id)) fail(`node ${n.id}`, 'not reachable from the trigger')
  if (!chain.length && !branches.length) fail('nodes', 'add at least one agent, tool or http node')
  if (issues.length) throw new BuilderError(issues)

  const scope: Scope = { steps: new Set(), inputs: new Set(start.data.inputs.map((i) => i.name)) }
  const tools = new Set<string>()
  const steps: CompiledWorkflow['steps'] = {}
  const graph: unknown[] = []

  // Turns one text field into a Mastra mapping descriptor, keeping types for a lone reference.
  const describe = (where: string, raw: unknown): Descriptor => {
    if (typeof raw !== 'string') return { value: raw }
    // Mastra templates can read requestContext, which holds the secrets: never pass user ${...} through.
    if (raw.includes('${')) { fail(where, '"${" is not allowed; use {{steps.<node>.<field>}} or {{input.<name>}}'); return { value: raw } }
    for (const m of raw.matchAll(REF)) {
      if (m[2] && !scope.steps.has(m[2])) fail(where, `{{steps.${m[2]}…}} must be a node that runs earlier on this path`)
      if (!m[2] && !scope.inputs.has(m[3].split('.')[0])) fail(where, `{{input.${m[3]}}} is not a trigger input`)
    }
    const only = raw.match(ONLY_REF)
    if (only) return only[2] ? { step: only[2], path: only[3] } : { initData: true, path: only[3] }
    if (!raw.match(REF)) return { value: raw }
    return { template: raw.replace(REF, (_m, _k, step, path) => (step ? `\${stepResults.${step}.${path}}` : `\${initData.${path}}`)) }
  }

  // The mapping config and the Mastra step for one action node.
  const action = (n: ActionNode): { config: Record<string, Descriptor>; step: Record<string, unknown> } => {
    const where = `node ${n.id}`
    if (n.type === 'agent') {
      steps[n.id] = { node: n.id, type: 'agent' }
      return { config: { prompt: describe(`${where}.prompt`, n.data.prompt) }, step: { type: 'agent', id: n.id, agentId: 'mind' } }
    }
    if (n.type === 'http') {
      tools.add('http_request')
      steps[n.id] = { node: n.id, type: 'http', tool: 'http_request' }
      const config: Record<string, Descriptor> = { method: { value: n.data.method }, url: describe(`${where}.url`, n.data.url) }
      if (n.data.headers) {
        // Headers are sent as one value, so they may hold {{secrets.NAME}} but not step references.
        if (Object.values(n.data.headers).some((v) => v.includes('${') || v.match(REF))) fail(`${where}.headers`, 'headers cannot use references')
        config.headers = { value: n.data.headers }
      }
      if (n.data.body !== undefined) config.body = describe(`${where}.body`, n.data.body)
      return { config, step: { type: 'tool', id: n.id, toolId: 'http_request' } }
    }
    const tool = n.data.tool
    if (!(tool in toolRegistry)) fail(`${where}.tool`, `unknown tool ${tool}`)
    // A workflow tool step runs without asking (spike 02), so approval tools are never allowed.
    else if (needsApproval(tool)) fail(`${where}.tool`, `${tool} needs the owner's approval and cannot run in a workflow`)
    tools.add(tool)
    steps[n.id] = { node: n.id, type: 'tool', tool }
    return { config: Object.fromEntries(Object.entries(n.data.args).map(([k, v]) => [k, describe(`${where}.args.${k}`, v)])), step: { type: 'tool', id: n.id, toolId: tool } }
  }

  for (const n of chain) {
    const { config, step } = action(n)
    graph.push({ type: 'mapping', id: `in:${n.id}`, mapConfig: config }, step)
    scope.steps.add(n.id)
  }

  if (condition) {
    const where = `node ${condition.id}`
    const ref = condition.data.left.match(ONLY_REF)
    if (!ref) fail(`${where}.left`, 'must be one reference, e.g. {{steps.balance.balanceNear}}')
    else if (ref[2] && !scope.steps.has(ref[2])) fail(`${where}.left`, `{{steps.${ref[2]}…}} must be a node that runs earlier`)
    else if (!ref[2] && !scope.inputs.has(ref[3].split('.')[0])) fail(`${where}.left`, `{{input.${ref[3]}}} is not a trigger input`)
    const path = ref ? (ref[2] ? `stepResults.${ref[2]}.${ref[3]}` : `initData.${ref[3]}`) : ''
    const predicate = { op: condition.data.op, left: { path }, right: { literal: condition.data.right } }

    // Branch steps cannot have their own mapping, so one mapping feeds both (spike 02):
    // each branch reads its own keys and ignores the rest.
    const merged: Record<string, Descriptor> = {}
    const stepsOut: unknown[] = []
    const predicates: unknown[] = []
    for (const b of [...branches.filter((x) => x.handle === 'then'), ...branches.filter((x) => x.handle === 'else')]) {
      const { config, step } = action(b.node)
      for (const [k, d] of Object.entries(config)) {
        if (k in merged && JSON.stringify(merged[k]) !== JSON.stringify(d)) fail(`node ${b.node.id}`, `both branches need a different "${k}"; make one branch a different kind of node`)
        merged[k] = d
      }
      stepsOut.push(step)
      predicates.push(b.handle === 'then' ? predicate : { op: 'not', arg: predicate })
    }
    graph.push({ type: 'mapping', id: `in:${condition.id}`, mapConfig: merged }, { type: 'conditional', id: condition.id, steps: stepsOut, predicates })
  }
  if (issues.length) throw new BuilderError(issues)

  const inputProps = Object.fromEntries(start.data.inputs.map((i) => [i.name, { type: i.type }]))
  return {
    definition: {
      id: mastraWorkflowId(mindId, workflowId),
      description: canvas.description ?? canvas.name,
      inputSchema: { type: 'object', properties: inputProps, required: Object.keys(inputProps) },
      outputSchema: { type: 'object', properties: {} },
      metadata: { hellonear: { v: 1, mindId, workflowId, canvas, tools: [...tools], steps, schedule: start.data.schedule ?? null } },
      graph,
    },
    tools: [...tools],
    steps,
  }
}
