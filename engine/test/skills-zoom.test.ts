// Live prompt test for the Zoom skill (#246), against real NEAR AI Cloud and the local Postgres. Composio is a fake that
// answers like the tools' latest output schemas (no real Zoom account is connected yet, so this proves the Mind's flow,
// not Zoom's answers). Owner in Asia/Jakarta. Run:
//   node --env-file=.env --import tsx --test test/skills-zoom.test.ts
// 1. "Set up a Zoom call tomorrow 10:00 for 30 minutes": an approval card with 10:00 tomorrow on the owner's clock and
//    30 minutes, nothing created before approve; created once after.
// 2. "What did we decide in yesterday's call?" with a summary: the answer comes from it.
// 3. The same with no summary (the host had it off): the Mind says there is none and invents nothing.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { server } from '../src/server.ts'
import { resetComposioSessions } from '../src/composio.ts'
import { localTime } from '../src/tools.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
// A fresh user per test: the Mind's working memory is per user, and the summary test's memory would otherwise
// answer the no-summary test (seen in run 1: "from our earlier conversation, the decisions were…").
const newUser = () => `usr_zoom_${randomUUID().slice(0, 8)}`
const ZONE = 'Asia/Jakarta'
const DAY = 24 * 3600_000

const creates: any[] = []
const summaryCalls: any[] = []
let withSummary = true
const ok = (data: unknown) => ({ result_type: 'completed', error: null, data })
// Yesterday 14:00 and three days ago 09:00, on the owner's clock (Jakarta has no daylight saving: always +07:00).
const at = (daysFromNow: number, hhmm: string) => new Date(`${localTime(new Date(Date.now() + daysFromNow * DAY), ZONE).date}T${hhmm}:00+07:00`).toISOString().replace(/\.\d{3}Z$/, 'Z')
const YESTERDAY_ID = 84512345678
const answers: Record<string, (a: any) => unknown> = {
  ZOOM_LIST_MEETINGS: (a) => ok({ page_size: 30, total_records: 2, meetings: a.type === 'previous_meetings'
    ? [
      { id: 84500000001, uuid: 'older==', host_id: 'h', topic: 'Supplier check-in', type: 2, duration: 30, timezone: ZONE, created_at: at(-10, '09:00'), start_time: at(-3, '09:00'), join_url: 'https://zoom.us/j/84500000001' },
      { id: YESTERDAY_ID, uuid: 'yday==', host_id: 'h', topic: 'Launch planning', type: 2, duration: 45, timezone: ZONE, created_at: at(-5, '09:00'), start_time: at(-1, '14:00'), join_url: 'https://zoom.us/j/84512345678' },
    ]
    : [] }),
  ZOOM_CREATE_A_MEETING: (a) => { creates.push(a); return ok({ id: 87700011122, uuid: 'new==', host_id: 'h', topic: a.topic, type: 2, duration: a.duration, timezone: a.timezone, start_time: a.start_time, join_url: 'https://zoom.us/j/87700011122?pwd=abc', start_url: 'https://zoom.us/s/hostsecret' }) },
  ZOOM_LIST_PAST_MEETING_INSTANCES: (a) => ok({ meetings: String(a.meetingId) === String(YESTERDAY_ID) ? [{ uuid: 'yday-instance==', meeting_id: YESTERDAY_ID }] : [{ uuid: 'older-instance==', meeting_id: 84500000001 }] }),
  ZOOM_GET_A_MEETING_SUMMARY: (a) => {
    summaryCalls.push(a)
    const base = { meeting_id: String(YESTERDAY_ID), meeting_uuid: a.meetingId, meeting_topic: 'Launch planning', meeting_start_time: at(-1, '14:00'), meeting_end_time: at(-1, '14:45'), meeting_host_id: 'h', meeting_host_email: 'owner@example.com', summary_created_time: at(-1, '15:00'), summary_last_modified_time: at(-1, '15:00'), summary_title: 'Launch planning' }
    if (a.meetingId !== 'yday-instance==') return { result_type: 'error', error: 'Meeting does not exist', data: {} }
    // Without a summary Zoom leaves summary_content out (its schema: "may not be returned").
    return ok(withSummary ? { ...base, summary_content: 'Decisions: move the launch to Thursday 20 November. Next steps: Rina sends the new price list by Friday.' } : base)
  },
}
const fake = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  const body = raw ? JSON.parse(raw) : undefined
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.url === '/tool_router/session') return send(201, { session_id: `trs_${body.user_id}` })
  if (!/^\/tool_router\/session\/[^/]+\/execute$/.test(req.url!)) return send(404, {})
  const answer = answers[body.tool_slug]
  return answer ? send(200, answer(body.arguments)) : send(400, { error: { slug: 'unknown_tool' } })
})

before(async () => {
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r))
  process.env.COMPOSIO_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`
  process.env.COMPOSIO_API_KEY = 'ak_test'
  resetComposioSessions()
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(async () => {
  await new Promise<void>((r) => fake.close(() => r()))
  await new Promise<void>((r) => server.close(() => r()))
})

type Ev = Record<string, any>
const mind = { templateId: 'general-assistant', name: 'Zia', soul: { identity: 'You run the owner\'s meetings.', invariants: ['Never invent facts.'], priors: [] }, skills: [{ skillId: 'zoom' }] }
async function post(path: string, body: unknown): Promise<Ev[]> {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-key': key }, body: JSON.stringify(body) })
  assert.equal(res.status, 200, await res.clone().text())
  return (await res.text()).split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}
const finalText = (evs: Ev[]) => evs.find((e) => e.type === 'run.finished')?.text ?? ''
const trail = (evs: Ev[]) => evs.filter((e) => e.tool).map((e) => `${e.type}:${e.tool}`)

const RUN = process.env.RUN ?? '1'

test(`run ${RUN}: a Zoom call tomorrow 10:00 for 30 minutes asks first, with the owner's local time; made only after approve`, async () => {
  creates.length = 0
  const userId = newUser()
  const threadId = randomUUID()
  const first = await post('/v1/minds/zia/chat', { userId, threadId, timeZone: ZONE, mind, message: 'Set up a Zoom call tomorrow at 10:00 for 30 minutes to go over the launch.' })
  console.log(`  tools: ${trail(first).join(', ')}`)
  const card = first.find((e) => e.type === 'tool.approval_required' && e.tool === 'zoom_create_meeting')
  assert.ok(card, `an approval card: ${trail(first)} / ${finalText(first)}`)
  console.log(`  card args: ${JSON.stringify(card.args)}`)
  const tomorrow = localTime(new Date(Date.now() + DAY), ZONE).date
  assert.equal(Date.parse(card.args.start), Date.parse(`${tomorrow}T10:00:00+07:00`), `10:00 tomorrow in Jakarta: ${card.args.start}`)
  assert.match(card.args.start, /\+07:00$/, 'the owner\'s offset on the card')
  assert.equal(card.args.minutes, 30)
  assert.equal(creates.length, 0, 'nothing created before approval')

  const rest = await post(`/v1/runs/${card.runId}/approve?mindId=zia`, { userId, threadId, timeZone: ZONE, mind, toolCallId: card.toolCallId })
  const done = rest.find((e) => e.type === 'tool.result' && e.tool === 'zoom_create_meeting')
  assert.equal(done?.result?.status, 'created', JSON.stringify(rest.filter((e) => e.tool)))
  assert.equal(creates.length, 1)
  assert.equal(creates[0].start_time, new Date(`${tomorrow}T10:00:00+07:00`).toISOString().replace(/\.\d{3}Z$/, 'Z'))
  assert.equal(done.result.startLocal.endsWith(' 10:00'), true, done.result.startLocal)
  const text = finalText(rest)
  console.log(`  reply: ${text.replace(/\s+/g, ' ').slice(0, 400)}`)
  assert.match(text, /zoom\.us\/j\/87700011122/, 'the join link')
  assert.ok(!text.includes('hostsecret'))
})

test(`run ${RUN}: "what did we decide in yesterday's call?" answers from Zoom's summary`, async () => {
  withSummary = true
  summaryCalls.length = 0
  const userId = newUser()
  const evs = await post('/v1/minds/zia/chat', { userId, threadId: randomUUID(), timeZone: ZONE, mind, message: 'What did we decide in yesterday\'s call?' })
  console.log(`  tools: ${trail(evs).join(', ')}`)
  const text = finalText(evs)
  console.log(`  reply: ${text.replace(/\s+/g, ' ').slice(0, 400)}`)
  const result = evs.find((e) => e.type === 'tool.result' && e.tool === 'zoom_meeting_summary')
  assert.equal(result?.result?.status, 'found', trail(evs).join(', '))
  assert.equal(String(evs.find((e) => e.type === 'tool.called' && e.tool === 'zoom_meeting_summary')?.args?.meetingId), String(YESTERDAY_ID), 'yesterday\'s meeting')
  assert.match(text, /Thursday|20 Nov/i)
  assert.equal(evs.filter((e) => e.type === 'tool.approval_required').length, 0)
})

test(`run ${RUN}: with no summary it says so and invents nothing`, async () => {
  withSummary = false
  summaryCalls.length = 0
  const userId = newUser()
  const evs = await post('/v1/minds/zia/chat', { userId, threadId: randomUUID(), timeZone: ZONE, mind, message: 'What did we decide in yesterday\'s call?' })
  console.log(`  tools: ${trail(evs).join(', ')}`)
  const text = finalText(evs)
  console.log(`  reply: ${text.replace(/\s+/g, ' ').slice(0, 500)}`)
  const result = evs.find((e) => e.type === 'tool.result' && e.tool === 'zoom_meeting_summary')
  assert.equal(result?.result?.status, 'none', trail(evs).join(', '))
  assert.ok(summaryCalls.length >= 1)
  assert.match(text, /no (AI )?summary|summary (isn't|is not|wasn't|was not) (available|turned on|on)|(doesn't|does not|didn't|did not) have (an? )?(AI )?summary|no .{0,30}summary/i, 'says there is no summary')
  assert.doesNotMatch(text, /Thursday|price list|20 Nov/i, 'nothing from a summary that does not exist')
})
