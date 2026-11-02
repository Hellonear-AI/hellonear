// Canvases shared by the builder unit and integration tests.
// The #20 example: check a balance, then notify only when it is low.
export const balanceAlert = () => ({
  name: 'Low balance alert',
  nodes: [
    { id: 'start', type: 'trigger', position: { x: 0, y: 0 }, data: { schedule: { cron: '0 * * * *' }, inputs: [{ name: 'account', type: 'string' }] } },
    { id: 'balance', type: 'tool', data: { tool: 'near_view_account', args: { accountId: '{{input.account}}' } } },
    { id: 'low', type: 'condition', data: { left: '{{steps.balance.balanceNear}}', op: 'lt', right: 1000 } },
    { id: 'notify', type: 'http', data: { method: 'POST', url: 'https://httpbin.org/post', headers: { 'X-Hook': '{{secrets.HOOK}}' }, body: '{{steps.balance.accountId}} has {{steps.balance.balanceNear}} NEAR' } },
    { id: 'chill', type: 'agent', data: { prompt: 'Say in five words that {{steps.balance.accountId}} is fine.' } },
  ],
  edges: [
    { source: 'start', target: 'balance' },
    { source: 'balance', target: 'low' },
    { source: 'low', target: 'notify', sourceHandle: 'then' },
    { source: 'low', target: 'chill', sourceHandle: 'else' },
  ],
})
