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
  // An If way with more than one step is its own dynamic workflow (#153), registered before `definition`.
  children: (Record<string, unknown> & { id: string; graph: unknown[] })[]
  // Registry keys of every tool the workflow calls; the Mind must have all of them to run it.
  tools: string[]
  // Mastra step id → canvas node, for events and the Mind Graph.
  // A way's own entry (`way: true`) carries its last node: run history only keeps the way's final output.
  steps: Record<string, { node: string; type: ActionNode['type']; tool?: string; way?: true }>
}

// Mastra workflow id of an If way's nested workflow (#153). Workflow ids never contain "--", so it can't collide.
export const wayWorkflowId = (mindId: string, workflowId: string, handle: 'then' | 'else') => `${mastraWorkflowId(mindId, workflowId)}--${handle}`

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
  // Each way of the If is a chain of action nodes (#153); one node is the common case.
  const branches: { handle: 'then' | 'else'; nodes: ActionNode[] }[] = []
  const seen = new Set([start.id])
  let current: Node = start
  for (;;) {
    const next = out(current.id)
    if (current.type === 'condition') {
      for (const e of next) {
        if (!e.sourceHandle) { fail(`node ${current.id}`, 'condition edges need sourceHandle "then" or "else"'); continue }
        if (branches.some((b) => b.handle === e.sourceHandle)) { fail(`node ${current.id}`, `more than one "${e.sourceHandle}" edge`); continue }
        const way: ActionNode[] = []
        for (let target: Node | undefined = byId.get(e.target); target; ) {
          if (target.type === 'trigger' || target.type === 'condition') { fail(`node ${target.id}`, 'a step on an If way must be an agent, tool or http node'); break }
          if (seen.has(target.id)) { fail(`node ${target.id}`, 'used twice'); break }
          seen.add(target.id)
          way.push(target)
          const after = out(target.id)
          if (after.length > 1) { fail(`node ${target.id}`, 'a step on an If way can have only one next step'); break }
          target = after.length ? byId.get(after[0].target) : undefined
        }
        branches.push({ handle: e.sourceHandle, nodes: way })
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
  const children: CompiledWorkflow['children'] = []

  // Inside a multi-step If way (#153): its own earlier steps are local; anything from before the If reaches the
  // nested workflow through the If's mapping, as an input key (`pass`).
  type Way = { local: Set<string>; pass: Map<string, { key: string; from: Descriptor }> }
  let way: Way | null = null
  const passKey = (ref: string, from: Descriptor) => {
    if (!way!.pass.has(ref)) way!.pass.set(ref, { key: `p${way!.pass.size}`, from })
    return way!.pass.get(ref)!.key
  }

  // Turns one text field into a Mastra mapping descriptor, keeping types for a lone reference.
  const describe = (where: string, raw: unknown): Descriptor => {
    if (typeof raw !== 'string') return { value: raw }
    // Mastra templates can read requestContext, which holds the secrets: never pass user ${...} through.
    if (raw.includes('${')) { fail(where, '"${" is not allowed; use {{steps.<node>.<field>}} or {{input.<name>}}'); return { value: raw } }
    // One reference → where its value comes from in the Mastra workflow being built.
    const source = (step: string | undefined, path: string): { step: string; path: string } | { initData: true; path: string } | null => {
      if (step && way?.local.has(step)) return { step, path }
      if (step && !scope.steps.has(step)) { fail(where, `{{steps.${step}…}} must be a node that runs earlier on this path`); return null }
      if (!step && !scope.inputs.has(path.split('.')[0])) { fail(where, `{{input.${path}}} is not a trigger input`); return null }
      const outer = step ? { step, path } : { initData: true as const, path }
      return way ? { initData: true, path: passKey(`${step ?? 'input'}.${path}`, outer) } : outer
    }
    const only = raw.match(ONLY_REF)
    if (only) return source(only[2], only[3]) ?? { value: raw }
    if (!raw.match(REF)) return { value: raw }
    return {
      template: raw.replace(REF, (m, _k, step, path) => {
        const src = source(step, path)
        return !src ? m : 'step' in src ? `\${stepResults.${src.step}.${src.path}}` : `\${initData.${src.path}}`
      }),
    }
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
    // A workflow tool step runs without asking (spike 02), so approval tools are never allowed. The canvas-only tools
    // (tools.ts CANVAS_ONLY, #146) need no approval: the owner placing them on the canvas is the approval.
    else if (needsApproval(tool)) fail(`${where}.tool`, `${tool} needs the owner's approval and cannot run in a workflow`)
    // Email me sends only the Mind's own words, never raw tool output such as an email body or a web page (#146).
    if (tool === 'mail_send_to_owner') {
      for (const [k, v] of Object.entries(n.data.args)) {
        for (const m of typeof v === 'string' ? v.matchAll(REF) : []) {
          if (m[2] && byId.get(m[2]) && byId.get(m[2])!.type !== 'agent') fail(`${where}.args.${k}`, `{{steps.${m[2]}…}} is not a note from the Mind; Email me can only send what the Mind wrote`)
        }
      }
    }
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

    // Branch steps cannot have their own mapping, so one mapping feeds both (spike 02): a one-step way reads its own
    // keys and ignores the rest. A longer way (#153) is a nested workflow with its own mappings; the shared mapping
    // only hands it the values from before the If that it uses.
    const merged: Record<string, Descriptor> = {}
    const stepsOut: unknown[] = []
    const predicates: unknown[] = []
    const add = (at: string, k: string, d: Descriptor) => {
      if (k in merged && JSON.stringify(merged[k]) !== JSON.stringify(d)) fail(at, `both branches need a different "${k}"; make one branch a different kind of node`)
      merged[k] = d
    }
    for (const b of [...branches.filter((x) => x.handle === 'then'), ...branches.filter((x) => x.handle === 'else')]) {
      if (b.nodes.length === 1) {
        const { config, step } = action(b.nodes[0])
        for (const [k, d] of Object.entries(config)) add(`node ${b.nodes[0].id}`, k, d)
        stepsOut.push(step)
      } else if (b.nodes.length > 1) {
        way = { local: new Set(), pass: new Map() }
        const wayGraph: unknown[] = []
        const wayId = `way-${b.handle}`
        for (const n of b.nodes) {
          const { config, step } = action(n)
          // action() registered the node under its own id; inside a way, events arrive as `<wayId>.<node>`.
          steps[`${wayId}.${n.id}`] = steps[n.id]
          delete steps[n.id]
          wayGraph.push({ type: 'mapping', id: `in:${n.id}`, mapConfig: config }, step)
          way.local.add(n.id)
        }
        const last = b.nodes[b.nodes.length - 1]
        steps[wayId] = { ...steps[`${wayId}.${last.id}`], way: true }
        const pass = [...way.pass.values()]
        way = null
        for (const p of pass) add(`node ${condition.id}`, `${b.handle}_${p.key}`, p.from)
        const childId = wayWorkflowId(mindId, workflowId, b.handle)
        children.push({
          id: childId,
          description: `${canvas.name}: if ${b.handle === 'then' ? 'yes' : 'no'}`,
          inputSchema: { type: 'object', properties: Object.fromEntries(pass.map((p) => [`${b.handle}_${p.key}`, {}])) },
          outputSchema: { type: 'object', properties: {} },
          metadata: { hellonearWay: { v: 1, mindId, workflowId, handle: b.handle } },
          // The nested workflow reads `<handle>_pN` from its input; rename here so both ways share one mapping.
          graph: JSON.parse(JSON.stringify(wayGraph).replace(/"initData":true,"path":"(p\d+)/g, `"initData":true,"path":"${b.handle}_$1`).replace(/\$\{initData\.(p\d+)/g, `\${initData.${b.handle}_$1`)),
        })
        stepsOut.push({ type: 'workflow', id: wayId, workflowId: childId })
      }
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
    children,
    tools: [...tools],
    steps,
  }
}
