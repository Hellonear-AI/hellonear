// Live prompt test for free time and moving an event (#247 item 3): the Mind lists the calendar, then asks to move the
// event with its old and new time on the approval card, and nothing is written before the owner approves; an event that
// moved meanwhile is refused; finding free time asks nothing. Real NEAR AI Cloud and the local Postgres; Composio is a
// fake that answers like the tools' latest output schemas (20261110_00; no real calendar is connected for this, so it
// proves the Mind's flow, not Google's answers).
// Run: node --env-file=.env --import tsx --test test/skills-calendar-move.test.ts
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { server } from '../src/server.ts'
import { resetComposioSessions } from '../src/composio.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const userId = `usr_calmove_${randomUUID().slice(0, 8)}`
const timeZone = 'Asia/Jakarta'

// Tomorrow on the owner's clock (Jakarta has no clock changes, always +07:00).
const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now() + 24 * 3600_000)
const at = (hhmm: string) => `${tomorrow}T${hhmm}:00+07:00`
const instant = (t: string) => Date.parse(t)

type Ev = Record<string, any>
let events: Record<string, any> = {}
const reset = () => {
  events = {
    gym1: { id: 'gym1', summary: 'Gym', status: 'confirmed', start: { dateTime: at('08:00') }, end: { dateTime: at('09:00') }, organizer: { self: true }, htmlLink: 'https://calendar.example/gym1' },
    cc1: {
      id: 'cc1', summary: 'Client call with Dimas', status: 'confirmed', start: { dateTime: at('15:00') }, end: { dateTime: at('16:00') }, organizer: { self: true }, htmlLink: 'https://calendar.example/cc1',
      attendees: [{ email: 'owner@example.com', self: true }, { email: 'dimas@kopikita.example', displayName: 'Dimas' }],
    },
  }
}
const patches: any[] = []
const slugs: string[] = []
const ok = (data: unknown) => ({ result_type: 'completed', error: null, data })
const answers: Record<string, (a: any) => unknown> = {
  GOOGLECALENDAR_EVENTS_LIST: () => ok({ kind: 'calendar#events', items: Object.values(events).sort((a, b) => instant(a.start.dateTime) - instant(b.start.dateTime)) }),
  GOOGLECALENDAR_EVENTS_GET: (a) => (events[a.event_id] ? ok(events[a.event_id]) : { result_type: 'error', error: 'Not Found', data: null }),
  GOOGLECALENDAR_PATCH_EVENT: (a) => {
    patches.push(a)
    const e = events[a.event_id]
    e.start = { dateTime: a.start_time }
    e.end = { dateTime: a.end_time }
    return ok({ ...e, display_url: e.htmlLink })
  },
  GOOGLECALENDAR_FIND_FREE_SLOTS: (a) => ok({
    kind: 'calendar#freeBusy', timeMin: a.time_min, timeMax: a.time_max,
    calendars: { primary: { busy: Object.values(events).map((e) => ({ start: new Date(e.start.dateTime).toISOString(), end: new Date(e.end.dateTime).toISOString() })), free: [] } },
  }),
}
const fake = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  const body = raw ? JSON.parse(raw) : undefined
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.url === '/tool_router/session') return send(201, { session_id: `trs_${body.user_id}` })
  if (!/^\/tool_router\/session\/[^/]+\/execute$/.test(req.url!)) return send(404, {})
  slugs.push(body.tool_slug)
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
beforeEach(() => { reset(); patches.length = 0; slugs.length = 0 })

const mind = { templateId: 'general-assistant', name: 'Sia', soul: { identity: 'You keep the owner\'s calendar tidy.', invariants: [], priors: [] }, skills: [{ skillId: 'daily-planner' }] }
async function post(path: string, body: unknown): Promise<Ev[]> {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-key': key }, body: JSON.stringify(body) })
  assert.equal(res.status, 200, await res.clone().text())
  return (await res.text()).split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}
const toolsOf = (evs: Ev[]) => evs.filter((e) => e.type === 'tool.called').map((e) => e.tool)

async function askToMove() {
  const threadId = randomUUID()
  const first = await post('/v1/minds/sia/chat', { userId, threadId, mind, timeZone, message: 'Move my 3pm client call tomorrow to 4pm.' })
  const tools = toolsOf(first)
  assert.equal(first.filter((e) => e.type === 'tool.result' && e.result?.error === true).length, 0, JSON.stringify(first.filter((e) => e.result?.error)))
  const card = first.find((e) => e.type === 'tool.approval_required' && e.tool === 'googlecalendar_move_event')
  assert.ok(card, `no move card: ${JSON.stringify(tools)} ${JSON.stringify(first.filter((e) => e.type === 'text.delta').map((e) => e.text ?? e.delta).join(''))}`)
  assert.ok(tools.indexOf('googlecalendar_list_events') !== -1 && tools.indexOf('googlecalendar_list_events') < tools.indexOf('googlecalendar_move_event'), `listed before the move: ${tools}`)
  // The card carries the old and the new time.
  assert.equal(card.args.eventId, 'cc1', JSON.stringify(card.args))
  assert.equal(instant(card.args.oldStart), instant(at('15:00')), JSON.stringify(card.args))
  assert.equal(instant(card.args.oldEnd), instant(at('16:00')), JSON.stringify(card.args))
  assert.equal(instant(card.args.newStart), instant(at('16:00')), JSON.stringify(card.args))
  assert.equal(instant(card.args.newEnd), instant(at('17:00')), JSON.stringify(card.args))
  assert.equal(patches.length, 0, 'nothing written before approval')
  return { threadId, card }
}

test('moving "my 3pm" to 4pm: list first, a card with the old and new time; patched only after approve, nobody emailed', async () => {
  const { threadId, card } = await askToMove()
  const rest = await post(`/v1/runs/${card.runId}/approve?mindId=sia`, { userId, threadId, mind, timeZone, toolCallId: card.toolCallId })
  const done = rest.find((e) => e.type === 'tool.result' && e.tool === 'googlecalendar_move_event')
  assert.equal(done?.result?.status, 'moved', JSON.stringify(rest.filter((e) => e.tool)))
  assert.equal(patches.length, 1)
  assert.deepEqual(Object.keys(patches[0]).sort(), ['calendar_id', 'end_time', 'event_id', 'send_updates', 'start_time'], 'never attendees')
  assert.equal(patches[0].send_updates, 'none')
})

test('an event that moved after the card was shown is refused on approve, and nothing is written', async () => {
  const { threadId, card } = await askToMove()
  // The owner moved it in Google Calendar meanwhile.
  events.cc1.start = { dateTime: at('13:00') }
  events.cc1.end = { dateTime: at('14:00') }
  const rest = await post(`/v1/runs/${card.runId}/approve?mindId=sia`, { userId, threadId, mind, timeZone, toolCallId: card.toolCallId })
  const done = rest.find((e) => e.type === 'tool.result' && e.tool === 'googlecalendar_move_event')
  assert.equal(done?.result?.status, 'refused', JSON.stringify(rest.filter((e) => e.tool)))
  assert.equal(patches.length, 0, 'nothing written')
})

test('finding a free hour tomorrow asks nothing and writes nothing', async () => {
  const evs = await post('/v1/minds/sia/chat', { userId, threadId: randomUUID(), mind, timeZone, message: 'Find me a free hour tomorrow.' })
  const tools = toolsOf(evs)
  assert.ok(tools.includes('googlecalendar_find_free_time'), JSON.stringify(tools))
  const result = evs.find((e) => e.type === 'tool.result' && e.tool === 'googlecalendar_find_free_time')
  assert.ok(result?.result?.slots?.length > 0, JSON.stringify(result))
  assert.ok(!evs.some((e) => e.type === 'tool.approval_required'), 'no card')
  assert.equal(patches.length, 0)
  assert.ok(slugs.includes('GOOGLECALENDAR_FIND_FREE_SLOTS'))
})
