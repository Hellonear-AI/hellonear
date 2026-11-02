// Small k6 load test for builder workflows (#20): runs plus concurrent re-saves of the same workflow.
// Local tools only (add_numbers), so it spends no NEAR AI credit and never hits a public RPC or httpbin.
// -e AGENT=1 makes the else branch an agent step (real NEAR AI calls: keep VUS and DURATION small).
// Run: k6 run -e BASE=http://localhost:4100 -e KEY=$ENGINE_API_KEY load/workflow.js
import http from 'k6/http'
import { check } from 'k6'

export const options = {
  scenarios: {
    run: { executor: 'constant-vus', vus: Number(__ENV.VUS || 5), duration: __ENV.DURATION || '30s', exec: 'run' },
    save: { executor: 'constant-arrival-rate', rate: 1, timeUnit: '2s', duration: __ENV.DURATION || '30s', preAllocatedVUs: 1, exec: 'save' },
  },
  thresholds: { checks: ['rate>0.99'], http_req_failed: ['rate<0.01'] },
}

const headers = { 'content-type': 'application/json', 'x-engine-key': __ENV.KEY }
const url = `${__ENV.BASE}/v1/minds/load-builder/workflows/sum-gate`
const canvas = (threshold) => JSON.stringify({
  name: 'Sum gate',
  nodes: [
    { id: 't', type: 'trigger', data: { inputs: [{ name: 'n', type: 'number' }] } },
    { id: 'sum', type: 'tool', data: { tool: 'add_numbers', args: { a: '{{input.n}}', b: 1 } } },
    { id: 'big', type: 'condition', data: { left: '{{steps.sum.sum}}', op: 'gt', right: threshold } },
    { id: 'twice', type: 'tool', data: { tool: 'add_numbers', args: { a: '{{steps.sum.sum}}', b: '{{steps.sum.sum}}' } } },
    __ENV.AGENT ? { id: 'now', type: 'agent', data: { prompt: 'Reply with the number {{steps.sum.sum}} only.' } } : { id: 'now', type: 'tool', data: { tool: 'get_time' } },
  ],
  edges: [
    { source: 't', target: 'sum' },
    { source: 'sum', target: 'big' },
    { source: 'big', target: 'twice', sourceHandle: 'then' },
    { source: 'big', target: 'now', sourceHandle: 'else' },
  ],
})

export function setup() {
  const res = http.put(url, canvas(10), { headers })
  if (res.status !== 200) throw new Error(`setup save failed: ${res.status} ${res.body}`)
}

export function save() {
  const res = http.put(url, canvas(10), { headers })
  check(res, { 'save 200': (r) => r.status === 200 })
}

export function run() {
  // With AGENT, most runs take the agent branch (n + 1 <= 10).
  const n = __ENV.AGENT ? __ITER % 12 : __ITER % 20
  const body = JSON.stringify({ userId: `load-${__VU}`, mind: { templateId: 'general-assistant', name: 'Lo', soul: { identity: 'Be brief.' }, skills: [{ skillId: 'daily-planner' }] }, input: { n } })
  const res = http.post(`${url}/runs`, body, { headers, timeout: '120s' })
  check(res, {
    'run 200': (r) => r.status === 200,
    'workflow success': (r) => r.body.includes('"type":"workflow.finished"') && r.body.includes('"status":"success"'),
    'right branch': (r) => r.body.includes(n + 1 > 10 ? '"node":"twice"' : '"node":"now"'),
    'ends with run.verified': (r) => r.body.trim().split('\n').filter((l) => l.startsWith('data: ')).pop().includes('"type":"run.verified"'),
    'agent badge verified': (r) => !__ENV.AGENT || n + 1 > 10 || r.body.includes('"status":"verified"'),
    'no run.error': (r) => !r.body.includes('"type":"run.error"'),
  })
}

export function teardown() {
  http.del(url, null, { headers })
}
