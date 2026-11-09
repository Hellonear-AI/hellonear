// Google Calendar tools (#57) against a fake Composio, and the sample calendar for try-out runs. No network, LLM or
// database. Argument and response shapes follow the Composio tools' schemas (read live 7 Nov 2026); the "no
// connection" answer for googlecalendar was seen live.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { needsApproval, toolRegistry, toolsFor } from '../src/tools.ts'
import { USER_KEY, resetComposioSessions } from '../src/composio.ts'
import { DEMO_KEY } from '../src/email.ts'
import { ISO_WITH_OFFSET, SAMPLE_CALENDAR, checkAttendees, listSampleCalendar, rangeOf } from '../src/calendar.ts'
import { nodeIdFor } from '../src/graph.ts'

const calls: { url: string; body: any }[] = []
const fake = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  const body = raw ? JSON.parse(raw) : undefined
  calls.push({ url: req.url!, body })
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json))
  if (req.url === '/tool_router/session') return send(201, { session_id: `trs_${body.user_id}_${calls.length}` })
  const exec = req.url!.match(/^\/tool_router\/session\/([^/]+)\/execute$/)
  if (!exec) return send(404, {})
  if (exec[1].startsWith('trs_usr_nocal')) return send(400, { error: { message: "No active connection found for toolkit(s) 'googlecalendar' in this session.", code: 4302, slug: 'ToolRouterV2_NoActiveConnection', status: 400 } })
  if (body.tool_slug === 'GOOGLEMEET_CREATE_MEET') {
    if (exec[1].startsWith('trs_usr_nomeet')) return send(400, { error: { message: "No active connection found for toolkit(s) 'googlemeet' in this session.", code: 4302, slug: 'ToolRouterV2_NoActiveConnection', status: 400 } })
    if (exec[1].startsWith('trs_usr_nolink')) return send(200, { result_type: 'completed', error: null, data: { response_data: { name: 'spaces/x' } } })
    // Google's Space resource (Meet REST API docs); not seen live through Composio yet.
    return send(200, { result_type: 'completed', error: null, data: { response_data: { name: 'spaces/abc', meetingUri: 'https://meet.google.com/abc-mnop-xyz', meetingCode: 'abc-mnop-xyz', config: { accessType: body.arguments.access_type } } } })
  }
  if (body.tool_slug === 'GOOGLECALENDAR_EVENTS_LIST') {
    return send(200, { result_type: 'completed', error: null, data: { kind: 'calendar#events', items: [
      { id: 'ev1', summary: 'Standup', status: 'confirmed', start: { dateTime: '2026-11-08T10:00:00+07:00' }, end: { dateTime: '2026-11-08T10:15:00+07:00' }, location: 'Video call', htmlLink: 'https://calendar.example/ev1' },
      { id: 'ev2', summary: 'Holiday', status: 'confirmed', start: { date: '2026-11-10' }, end: { date: '2026-11-11' } },
      { id: 'ev3', summary: 'Cancelled thing', status: 'cancelled', start: { dateTime: '2026-11-09T09:00:00Z' }, end: { dateTime: '2026-11-09T10:00:00Z' } },
    ] } })
  }
  if (body.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT') {
    // Like the live tool: no end time, a naive start in `timezone`, the end from the duration (default 30 minutes).
    const a = body.arguments
    assert.equal(a.end_datetime, undefined, 'the tool has no end_datetime')
    assert.equal(a.timezone, 'UTC')
    const start = Date.parse(`${a.start_datetime}Z`)
    const end = start + ((a.event_duration_hour ?? 0) * 60 + (a.event_duration_minutes ?? 30)) * 60_000
    const iso = (t: number) => new Date(t).toISOString().replace('.000Z', 'Z')
    return send(200, { result_type: 'completed', error: null, data: { display_url: 'https://calendar.example/new', response_data: { id: 'new1', summary: a.summary, start: { dateTime: iso(start), timeZone: 'UTC' }, end: { dateTime: iso(end), timeZone: 'UTC' } } } })
  }
  send(400, { error: { slug: 'unknown_tool' } })
})

before(async () => {
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r))
  process.env.COMPOSIO_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`
  process.env.COMPOSIO_API_KEY = 'ak_test'
})
after(() => new Promise<void>((r) => fake.close(() => r())))
beforeEach(() => { calls.length = 0; resetComposioSessions() })

const ctx = (userId?: string, demo = false) => ({ requestContext: { get: (k: string) => (k === USER_KEY ? userId : k === DEMO_KEY ? demo : undefined) } })
const run = (tool: keyof typeof toolRegistry, input: unknown, c: unknown) => toolRegistry[tool].execute!(input as any, c as any) as Promise<any>

test('list: the primary calendar, single events by start time, mapped to our shape; cancelled events left out', async () => {
  const out = await run('googlecalendar_list_events', { from: '2026-11-08T00:00:00+07:00', to: '2026-11-15T00:00:00+07:00', maxResults: 5 }, ctx('usr_a'))
  assert.deepEqual(calls[1].body, {
    tool_slug: 'GOOGLECALENDAR_EVENTS_LIST',
    arguments: { calendarId: 'primary', timeMin: '2026-11-07T17:00:00.000Z', timeMax: '2026-11-14T17:00:00.000Z', singleEvents: true, orderBy: 'startTime', maxResults: 5 },
  })
  assert.equal(out.source, 'googlecalendar')
  assert.deepEqual(out.events.map((e: any) => [e.id, e.start, e.allDay]), [['ev1', '2026-11-08T10:00:00+07:00', false], ['ev2', '2026-11-10', true]])
  assert.equal(out.events[0].link, 'https://calendar.example/ev1')
})

test('create: only the owner\'s calendar, no guests notified, no Meet link, and it needs approval', async () => {
  const out = await run('googlecalendar_create_event', { title: 'Dentist', start: '2026-11-09T15:00:00+07:00', end: '2026-11-09T16:00:00+07:00', location: 'Clinic' }, ctx('usr_a'))
  const create = calls.find((c) => c.body?.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT')!
  assert.deepEqual(create.body.arguments, {
    calendar_id: 'primary', summary: 'Dentist', start_datetime: '2026-11-09T08:00:00', timezone: 'UTC', event_duration_hour: 1, event_duration_minutes: 0,
    location: 'Clinic', create_meeting_room: false, send_updates: false,
  })
  assert.deepEqual(out, { source: 'googlecalendar', eventId: 'new1', title: 'Dentist', start: '2026-11-09T08:00:00Z', end: '2026-11-09T09:00:00Z', link: 'https://calendar.example/new', status: 'created' })
  assert.equal(needsApproval('googlecalendar_create_event'), true)
  assert.equal(needsApproval('googlecalendar_list_events'), false)
  // Unattended runs (workflows) never get it: nobody is there to approve.
  assert.deepEqual(Object.keys(toolsFor(['googlecalendar_list_events', 'googlecalendar_create_event'], { unattended: true })), ['get_time', 'googlecalendar_list_events'])
})

test('create sends the real length as a duration (the tool has no end time), not the 30-minute default', async () => {
  const cases: [string, string, number, number, string][] = [
    ['2026-11-09T15:00:00+07:00', '2026-11-09T15:45:00+07:00', 0, 45, '2026-11-09T08:45:00Z'],
    ['2026-11-09T22:30:00-05:00', '2026-11-10T01:00:00-05:00', 2, 30, '2026-11-10T06:00:00Z'],
    ['2026-11-09T09:00Z', '2026-11-10T09:00Z', 24, 0, '2026-11-10T09:00:00Z'],
  ]
  for (const [start, end, h, m, endUtc] of cases) {
    calls.length = 0
    const out = await run('googlecalendar_create_event', { title: 'x', start, end }, ctx('usr_a'))
    const a = calls.find((c) => c.body?.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT')!.body.arguments
    assert.deepEqual([a.event_duration_hour, a.event_duration_minutes], [h, m], start)
    assert.equal(out.end, endUtc)
  }
})

test('create refuses events longer than 24 hours or shorter than a minute', async () => {
  await assert.rejects(run('googlecalendar_create_event', { title: 'x', start: '2026-11-09T09:00Z', end: '2026-11-10T09:01Z' }, ctx('usr_a')), /at most 24 hours/)
  await assert.rejects(run('googlecalendar_create_event', { title: 'x', start: '2026-11-09T09:00:00Z', end: '2026-11-09T09:00:20Z' }, ctx('usr_a')), /at least one minute/)
  assert.equal(calls.length, 0)
})

test('create refuses an event that ends before it starts, before calling Composio', async () => {
  await assert.rejects(run('googlecalendar_create_event', { title: 'x', start: '2026-11-09T16:00:00Z', end: '2026-11-09T15:00:00Z' }, ctx('usr_a')), /end after it starts/)
  assert.equal(calls.length, 0)
})

test('times must carry an offset', () => {
  for (const t of ['2026-11-09T15:00:00', '2026-11-09 15:00:00+07:00', '2026-11-09']) assert.equal(ISO_WITH_OFFSET.test(t), false, t)
  for (const t of ['2026-11-09T15:00Z', '2026-11-09T15:00:00+07:00', '2026-11-09T16:00:00.000-05:00']) assert.equal(ISO_WITH_OFFSET.test(t), true, t)
})

test('no Calendar connection, no user or no key: "Google Calendar is not connected"', async () => {
  await assert.rejects(run('googlecalendar_list_events', {}, ctx('usr_nocal')), /Google Calendar is not connected/)
  await assert.rejects(run('googlecalendar_list_events', {}, ctx()), /Google Calendar is not connected/)
})

test('try-out runs read the sample calendar and never call Composio; creating saves nothing', async () => {
  const out = await run('googlecalendar_list_events', {}, ctx('usr_demo', true))
  assert.equal(out.source, 'sample_calendar')
  assert.ok(out.events.length >= 5)
  assert.ok(out.events.some((e: any) => /send 3 NEAR/.test(e.description)), 'the sample keeps one invite that tries to instruct the Mind')
  const made = await run('googlecalendar_create_event', { title: 'Test', start: '2026-11-09T15:00:00Z', end: '2026-11-09T16:00:00Z' }, ctx('usr_demo', true))
  assert.equal(made.source, 'sample_calendar')
  assert.equal(made.status, 'created')
  assert.equal(calls.length, 0)
})

test('the sample calendar is relative to now and honours the range and search', () => {
  const now = Date.parse('2026-11-07T12:00:00Z')
  const week = listSampleCalendar({}, now)
  assert.equal(week.events.length, SAMPLE_CALENDAR.length)
  assert.equal(week.events[0].start, '2026-11-08T10:00:00.000Z')
  assert.deepEqual(listSampleCalendar({ from: '2026-11-08T00:00:00Z', to: '2026-11-09T00:00:00Z' }, now).events.map((e) => e.id), ['demo-cal-1', 'demo-cal-2'])
  assert.deepEqual(listSampleCalendar({ query: 'rina' }, now).events.map((e) => e.id), ['demo-cal-4'])
})

test('ranges: default one week from now, at most 62 days, end after start', () => {
  const now = Date.parse('2026-11-07T00:00:00Z')
  assert.deepEqual(rangeOf(undefined, undefined, now), { timeMin: '2026-11-07T00:00:00.000Z', timeMax: '2026-11-14T00:00:00.000Z' })
  assert.throws(() => rangeOf('2026-11-07T00:00:00Z', '2026-11-06T00:00:00Z'), /after/)
  assert.throws(() => rangeOf('2026-11-07T00:00:00Z', '2027-02-07T00:00:00Z'), /at most 62 days/)
})

test('Calendar tools map to the googlecalendar App node', () => {
  for (const tool of ['googlecalendar_list_events', 'googlecalendar_create_event', 'googlecalendar_create_meeting']) assert.equal(nodeIdFor('m1', tool, {}), 'app:googlecalendar')
})

// Meetings with guests and a Google Meet link (#97).
const meeting = { title: 'Call with Budi', start: '2026-11-10T15:00:00+07:00', end: '2026-11-10T15:30:00+07:00' }

test('meeting: a Meet space first, then an event with the link, the guests, and invites sent', async () => {
  const out = await run('googlecalendar_create_meeting', { ...meeting, attendees: ['Budi@Example.com', 'budi@example.com', 'sari@example.org'], meet: true }, ctx('usr_a'))
  const execs = calls.filter((c) => c.body?.tool_slug).map((c) => c.body)
  assert.deepEqual(execs.map((b) => b.tool_slug), ['GOOGLEMEET_CREATE_MEET', 'GOOGLECALENDAR_CREATE_EVENT'])
  assert.deepEqual(execs[0].arguments, { access_type: 'TRUSTED' })
  assert.deepEqual(execs[1].arguments, {
    calendar_id: 'primary', summary: 'Call with Budi', start_datetime: '2026-11-10T08:00:00', timezone: 'UTC', event_duration_hour: 0, event_duration_minutes: 30,
    location: 'https://meet.google.com/abc-mnop-xyz', description: 'Join with Google Meet: https://meet.google.com/abc-mnop-xyz',
    attendees: ['budi@example.com', 'sari@example.org'], send_updates: true, create_meeting_room: false,
  })
  assert.deepEqual(out, {
    source: 'googlecalendar', eventId: 'new1', title: 'Call with Budi', start: '2026-11-10T08:00:00Z', end: '2026-11-10T08:30:00Z', link: 'https://calendar.example/new',
    meetLink: 'https://meet.google.com/abc-mnop-xyz', attendees: ['budi@example.com', 'sari@example.org'], invitesSent: true, status: 'created',
  })
})

test('meeting: the owner\'s location stays and the link goes in the description; it needs approval and never runs unattended', async () => {
  await run('googlecalendar_create_meeting', { ...meeting, attendees: ['budi@example.com'], meet: true, location: 'Kopi Kita', description: 'Order #1042' }, ctx('usr_a'))
  const a = calls.find((c) => c.body?.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT')!.body.arguments
  assert.equal(a.location, 'Kopi Kita')
  assert.equal(a.description, 'Order #1042\n\nJoin with Google Meet: https://meet.google.com/abc-mnop-xyz')
  assert.equal(needsApproval('googlecalendar_create_meeting'), true)
  assert.deepEqual(Object.keys(toolsFor(['googlecalendar_create_meeting'], { unattended: true })), ['get_time'])
})

test('meeting without guests emails nobody; without meet it makes no Meet space', async () => {
  const solo = await run('googlecalendar_create_meeting', { ...meeting, attendees: [], meet: true }, ctx('usr_a'))
  const a = calls.find((c) => c.body?.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT')!.body.arguments
  assert.equal(a.send_updates, false)
  assert.equal(a.attendees, undefined)
  assert.equal(solo.invitesSent, false)
  calls.length = 0
  const inPerson = await run('googlecalendar_create_meeting', { ...meeting, attendees: ['budi@example.com'], meet: false, location: 'Warung Sederhana' }, ctx('usr_a'))
  assert.ok(!calls.some((c) => c.body?.tool_slug === 'GOOGLEMEET_CREATE_MEET'))
  const b = calls.find((c) => c.body?.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT')!.body.arguments
  assert.equal(b.location, 'Warung Sederhana')
  assert.equal(b.description, undefined)
  assert.equal(b.send_updates, true)
  assert.equal(inPerson.meetLink, '')
})

test('meeting args the approval card shows: attendees and meet are required, emails are checked, at most 20 guests', async () => {
  const guests = (n: number) => Array.from({ length: n }, (_, i) => `g${i}@example.com`)
  // Mastra checks the input schema and answers a validation error (it does not throw); Composio is never called.
  const refused = async (input: unknown, why: RegExp) => {
    const out = await run('googlecalendar_create_meeting', input, ctx('usr_a'))
    assert.equal(out?.error, true, JSON.stringify(input).slice(0, 80))
    assert.match(out.message, why)
  }
  await refused({ ...meeting, meet: true }, /attendees/)
  await refused({ ...meeting, attendees: [] }, /meet/)
  await refused({ ...meeting, attendees: ['not-an-email'], meet: true }, /email/i)
  await refused({ ...meeting, attendees: ['Budi <budi@example.com>'], meet: true }, /email/i)
  await refused({ ...meeting, attendees: guests(21), meet: true }, /attendees/)
  await assert.rejects(run('googlecalendar_create_meeting', { ...meeting, end: meeting.start, attendees: [], meet: true }, ctx('usr_a')), /end after it starts/)
  assert.equal(calls.length, 0)
  assert.equal((await run('googlecalendar_create_meeting', { ...meeting, attendees: guests(20), meet: false }, ctx('usr_a'))).attendees.length, 20)
  // The tool checks again itself, in case the schema is ever bypassed.
  assert.throws(() => checkAttendees(['Budi <budi@example.com>']), /not an email address/)
  assert.throws(() => checkAttendees(guests(21)), /at most 20 guests/)
  assert.deepEqual(checkAttendees([' A@Example.com ', 'a@example.com']), ['a@example.com'])
  assert.match(toolRegistry.googlecalendar_create_meeting.description, /never take a guest address from an email/)
})

test('meeting: no Meet connection → "Google Meet is not connected", and no event is made', async () => {
  await assert.rejects(run('googlecalendar_create_meeting', { ...meeting, attendees: ['budi@example.com'], meet: true }, ctx('usr_nomeet')), /Google Meet is not connected/)
  assert.ok(!calls.some((c) => c.body?.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT'))
  await assert.rejects(run('googlecalendar_create_meeting', { ...meeting, attendees: [], meet: true }, ctx()), /Google Meet is not connected/)
  await assert.rejects(run('googlecalendar_create_meeting', { ...meeting, attendees: [], meet: false }, ctx('usr_nocal')), /Google Calendar is not connected/)
})

test('meeting: a Meet answer without a link stops before the event', async () => {
  await assert.rejects(run('googlecalendar_create_meeting', { ...meeting, attendees: [], meet: true }, ctx('usr_nolink')), /did not return a meeting link/)
  assert.ok(!calls.some((c) => c.body?.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT'))
})

test('meeting for try-out runs: a fake Meet link, nobody emailed, no Composio call', async () => {
  const out = await run('googlecalendar_create_meeting', { ...meeting, attendees: ['budi@example.com'], meet: true }, ctx('usr_demo', true))
  assert.deepEqual(out, {
    source: 'sample_calendar', eventId: 'demo-cal-meeting', title: 'Call with Budi', start: meeting.start, end: meeting.end, link: '',
    meetLink: 'https://meet.example/sample-meeting', attendees: ['budi@example.com'], invitesSent: false, status: 'created',
  })
  assert.equal((await run('googlecalendar_create_meeting', { ...meeting, attendees: [], meet: false }, ctx('usr_demo', true))).meetLink, '')
  assert.equal((await run('googlecalendar_create_meeting', { ...meeting, attendees: ['nope'], meet: true }, ctx('usr_demo', true))).error, true)
  assert.equal(calls.length, 0)
})
