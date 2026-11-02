// Small k6 load test for POST /v1/minds/{id}/chat (real NEAR AI calls; keep it short).
// Run: k6 run -e BASE=http://localhost:4100 -e KEY=$ENGINE_API_KEY load/chat.js
import http from 'k6/http'
import { check } from 'k6'

export const options = {
  vus: Number(__ENV.VUS || 3),
  duration: __ENV.DURATION || '30s',
  thresholds: { checks: ['rate>0.95'], http_req_failed: ['rate<0.05'] },
}

export default function () {
  const body = JSON.stringify({
    userId: `load-${__VU}`,
    threadId: `load-${__VU}-${__ITER}`,
    message: 'Use your tool: what is 2 + 3? Answer with the number only.',
    mind: { templateId: 'general-assistant', name: 'Lo', soul: { identity: 'Be brief.', invariants: [], priors: [] }, skills: [{ skillId: 's', toolKeys: ['add_numbers'] }] },
  })
  const res = http.post(`${__ENV.BASE}/v1/minds/load-${__VU}/chat`, body, { headers: { 'content-type': 'application/json', 'x-engine-key': __ENV.KEY }, timeout: '120s' })
  check(res, {
    'status 200': (r) => r.status === 200,
    'run finished': (r) => r.body.includes('"type":"run.finished"'),
    'tool ran': (r) => r.body.includes('"type":"tool.result"'),
    'no run.error': (r) => !r.body.includes('"type":"run.error"'),
  })
}
