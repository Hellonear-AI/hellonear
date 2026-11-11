// Google Calendar tools (#57) against a fake Composio, and the sample calendar for try-out runs. No network, LLM or
// database. Argument and response shapes follow the Composio tools' schemas (read live 7 Nov 2026); the "no
// connection" answer for googlecalendar was seen live.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { TIME_ZONE_KEY, needsApproval, toolRegistry, toolsFor } from '../src/tools.ts'
import { USER_KEY, resetComposioSessions } from '../src/composio.ts'
import { DEMO_KEY } from '../src/email.ts'
import { ISO_WITH_OFFSET, SAMPLE_CALENDAR, checkAttendees, freeSlots, listSampleCalendar, localTimes, rangeOf, zonedInstant } from '../src/calendar.ts'
import { ruleFor } from '../src/autoApprove.ts'
import { nodeIdFor } from '../src/graph.ts'

const calls: { url: string; body: any }[] = []
// One busy hour on Thu 12 Nov, 10:00 to 11:00 in Jakarta (03:00Z to 04:00Z).
const FREE_BUSY = [{ start: '2026-11-12T03:00:00Z', end: '2026-11-12T04:00:00Z' }]
// Google's Event resource as GOOGLECALENDAR_EVENTS_GET answers it.
const mover = () => ({
  id: 'mv1', summary: 'Client call', status: 'confirmed', htmlLink: 'https://calendar.example/mv1',
  start: { dateTime: '2026-11-12T15:00:00+07:00', timeZone: 'Asia/Jakarta' }, end: { dateTime: '2026-11-12T16:00:00+07:00', timeZone: 'Asia/Jakarta' },
  organizer: { email: 'me@example.com', self: true }, attendees: [{ email: 'me@example.com', self: true }, { email: 'rina@acme.example' }],
})
const EVENTS: Record<string, any> = {}
const resetEvents = () => {
  for (const k of Object.keys(EVENTS)) delete EVENTS[k]
  Object.assign(EVENTS, {
    mv1: mover(),
    guest1: { ...mover(), id: 'guest1', organizer: { email: 'boss@acme.example' } , summary: 'Board meeting' },
    allday1: { id: 'allday1', summary: 'Holiday', status: 'confirmed', start: { date: '2026-11-12' }, end: { date: '2026-11-13' }, organizer: { self: true } },
  })
}
resetEvents()
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
      { id: 'ev1', summary: 'Standup', status: 'confirmed', start: { dateTime: '2026-11-08T10:00:00+07:00' }, end: { dateTime: '2026-11-08T10:15:00+07:00' }, location: 'Video call', htmlLink: 'https://calendar.example/ev1',
        attendees: [{ email: 'me@example.com', self: true }, { email: 'rina@acme.example', displayName: 'Rina' }, { email: 'dimas@kopikita.example' }, { email: 'room-1@resource.calendar.google.com', resource: true }] },
      { id: 'ev2', summary: 'Holiday', status: 'confirmed', start: { date: '2026-11-10' }, end: { date: '2026-11-11' } },
      { id: 'ev3', summary: 'Cancelled thing', status: 'cancelled', start: { dateTime: '2026-11-09T09:00:00Z' }, end: { dateTime: '2026-11-09T10:00:00Z' } },
    ] } })
  }
  if (body.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT') {
    // Like the tool router's latest version (20261103_00, the one that runs live, #124): ISO times with an offset,
    // end_datetime wins over the duration, and send_updates must be one of the strings (a boolean is a 400 live).
    const a = body.arguments
    if (!['all', 'externalOnly', 'none'].includes(a.send_updates)) return send(400, { error: { message: "Input should be 'all', 'externalOnly' or 'none' on parameter `send_updates`" } })
    assert.match(a.start_datetime, /(Z|[+-]\d{2}:\d{2})$/, 'start carries its offset')
    const start = Date.parse(a.start_datetime)
    const end = a.end_datetime ? Date.parse(a.end_datetime) : start + ((a.event_duration_hour ?? 0) * 60 + (a.event_duration_minutes ?? 30)) * 60_000
    const iso = (t: number) => new Date(t).toISOString().replace('.000Z', 'Z')
    return send(200, { result_type: 'completed', error: null, data: { display_url: 'https://calendar.example/new', response_data: { id: 'new1', summary: a.summary, start: { dateTime: iso(start), timeZone: 'UTC' }, end: { dateTime: iso(end), timeZone: 'UTC' } } } })
  }
  // Free time and moving events (#247), shaped like the latest output schemas (20261110_00, read 11 Nov 2026).
  if (body.tool_slug === 'GOOGLECALENDAR_FIND_FREE_SLOTS') {
    if (exec[1].startsWith('trs_usr_unreliable')) return send(200, { result_type: 'completed', error: null, data: { kind: 'calendar#freeBusy', timeMin: body.arguments.time_min, timeMax: body.arguments.time_max, calendars: { primary: { busy: [], free: [], is_reliable: false } } } })
    return send(200, { result_type: 'completed', error: null, data: { kind: 'calendar#freeBusy', timeMin: body.arguments.time_min, timeMax: body.arguments.time_max, calendars: { primary: { busy: FREE_BUSY, free: [] } } } })
  }
  if (body.tool_slug === 'GOOGLECALENDAR_EVENTS_GET') {
    const e = EVENTS[body.arguments.event_id]
    return e ? send(200, { result_type: 'completed', error: null, data: e }) : send(200, { result_type: 'error', error: 'Not Found', data: null })
  }
  if (body.tool_slug === 'GOOGLECALENDAR_PATCH_EVENT') {
    const a = body.arguments
    const e = EVENTS[a.event_id]
    return send(200, { result_type: 'completed', error: null, data: { ...e, start: { dateTime: a.start_time }, end: { dateTime: a.end_time }, display_url: e?.htmlLink } })
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
  // Who else is on it (#107): not the owner, not the room; names as the invite gives them.
  assert.deepEqual(out.events[0].attendees, ['Rina <rina@acme.example>', 'dimas@kopikita.example'])
  assert.deepEqual(out.events[1].attendees, [])
})

test('create: only the owner\'s calendar, no guests notified, no Meet link, and it needs approval', async () => {
  const out = await run('googlecalendar_create_event', { title: 'Dentist', start: '2026-11-09T15:00:00+07:00', end: '2026-11-09T16:00:00+07:00', location: 'Clinic' }, ctx('usr_a'))
  const create = calls.find((c) => c.body?.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT')!
  assert.deepEqual(create.body.arguments, {
    calendar_id: 'primary', summary: 'Dentist', start_datetime: '2026-11-09T15:00:00+07:00', end_datetime: '2026-11-09T16:00:00+07:00', event_duration_hour: 1, event_duration_minutes: 0,
    location: 'Clinic', create_meeting_room: false, send_updates: 'none',
  })
  assert.deepEqual(out, { source: 'googlecalendar', eventId: 'new1', title: 'Dentist', start: '2026-11-09T08:00:00Z', end: '2026-11-09T09:00:00Z', link: 'https://calendar.example/new', status: 'created',
    startLocal: 'Mon 9 Nov 08:00', endLocal: 'Mon 9 Nov 09:00', timeZone: 'UTC' })
  assert.equal(needsApproval('googlecalendar_create_event'), true)
  assert.equal(needsApproval('googlecalendar_list_events'), false)
  // Unattended runs (workflows) never get it: nobody is there to approve.
  assert.deepEqual(Object.keys(toolsFor(['googlecalendar_list_events', 'googlecalendar_create_event'], { unattended: true })), ['get_time', 'googlecalendar_list_events'])
})

test('create sends the real length (end time and duration), not the 30-minute default', async () => {
  const cases: [string, string, number, number, string][] = [
    ['2026-11-09T15:00:00+07:00', '2026-11-09T15:45:00+07:00', 0, 45, '2026-11-09T08:45:00Z'],
    ['2026-11-09T22:30:00-05:00', '2026-11-10T01:00:00-05:00', 2, 30, '2026-11-10T06:00:00Z'],
    ['2026-11-09T09:00Z', '2026-11-10T09:00Z', 24, 0, '2026-11-10T09:00:00Z'],
  ]
  for (const [start, end, h, m, endUtc] of cases) {
    calls.length = 0
    const out = await run('googlecalendar_create_event', { title: 'x', start, end }, ctx('usr_a'))
    const a = calls.find((c) => c.body?.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT')!.body.arguments
    assert.deepEqual([a.end_datetime, a.event_duration_hour, a.event_duration_minutes], [end, h, m], start)
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
  // Like Google's q, the search also matches attendees' names and emails (#107).
  assert.deepEqual(listSampleCalendar({ query: 'rina' }, now).events.map((e) => e.id), ['demo-cal-1', 'demo-cal-4'])
  assert.deepEqual(listSampleCalendar({ query: 'dimas@kopikita.example' }, now).events.map((e) => e.id), ['demo-cal-2'])
  assert.deepEqual(listSampleCalendar({}, now).events.find((e) => e.id === 'demo-cal-2')?.attendees, ['Dimas Pratama <dimas@kopikita.example>'])
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
    calendar_id: 'primary', summary: 'Call with Budi', start_datetime: '2026-11-10T15:00:00+07:00', end_datetime: '2026-11-10T15:30:00+07:00', event_duration_hour: 0, event_duration_minutes: 30,
    location: 'https://meet.google.com/abc-mnop-xyz', description: 'Join with Google Meet: https://meet.google.com/abc-mnop-xyz',
    attendees: ['budi@example.com', 'sari@example.org'], send_updates: 'all', create_meeting_room: false,
  })
  assert.deepEqual(out, {
    source: 'googlecalendar', eventId: 'new1', title: 'Call with Budi', start: '2026-11-10T08:00:00Z', end: '2026-11-10T08:30:00Z', link: 'https://calendar.example/new',
    meetLink: 'https://meet.google.com/abc-mnop-xyz', attendees: ['budi@example.com', 'sari@example.org'], invitesSent: true, status: 'created',
    startLocal: 'Tue 10 Nov 08:00', endLocal: 'Tue 10 Nov 08:30', timeZone: 'UTC',
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
  assert.equal(a.send_updates, 'none')
  assert.equal(a.attendees, undefined)
  assert.equal(solo.invitesSent, false)
  calls.length = 0
  const inPerson = await run('googlecalendar_create_meeting', { ...meeting, attendees: ['budi@example.com'], meet: false, location: 'Warung Sederhana' }, ctx('usr_a'))
  assert.ok(!calls.some((c) => c.body?.tool_slug === 'GOOGLEMEET_CREATE_MEET'))
  const b = calls.find((c) => c.body?.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT')!.body.arguments
  assert.equal(b.location, 'Warung Sederhana')
  assert.equal(b.description, undefined)
  assert.equal(b.send_updates, 'all')
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
    startLocal: 'Tue 10 Nov 08:00', endLocal: 'Tue 10 Nov 08:30', timeZone: 'UTC',
  })
  assert.equal((await run('googlecalendar_create_meeting', { ...meeting, attendees: [], meet: false }, ctx('usr_demo', true))).meetLink, '')
  assert.equal((await run('googlecalendar_create_meeting', { ...meeting, attendees: ['nope'], meet: true }, ctx('usr_demo', true))).error, true)
  assert.equal(calls.length, 0)
})

test('the Meet link is found wherever Composio puts it; without one the error names the fields only (#124)', async () => {
  const { meetLinkOf } = await import('../src/calendar.ts')
  assert.equal(meetLinkOf({ response_data: { meetingUri: 'https://meet.google.com/abc-defg-hij' } }), 'https://meet.google.com/abc-defg-hij')
  assert.equal(meetLinkOf({ data: { space: { name: 'spaces/x', meeting_uri: 'https://meet.google.com/xyz-abcd-efg', meetingCode: 'xyz-abcd-efg' } } }), 'https://meet.google.com/xyz-abcd-efg')
  assert.throws(() => meetLinkOf({ response_data: { name: 'spaces/x', config: { accessType: 'TRUSTED' } } }), /fields: response_data, response_data\.name, response_data\.config, response_data\.config\.accessType/)
  assert.throws(() => meetLinkOf({ response_data: { link: 'https://evil.example/meet.google.com/x' } }), /did not return a meeting link/)
})

test('calendar times must carry the owner\'s offset when the zone is known (#124)', async () => {
  const { checkOwnerOffset } = await import('../src/tools.ts')
  assert.doesNotThrow(() => checkOwnerOffset(['2026-11-10T14:00:00+07:00'], 'Asia/Jakarta'))
  assert.throws(() => checkOwnerOffset(['2026-11-10T14:00:00+00:00'], 'Asia/Jakarta'), /Asia\/Jakarta, UTC\+07:00/)
  assert.throws(() => checkOwnerOffset(['2026-11-10T14:00:00Z'], 'Asia/Jakarta'), /\+07:00/)
  assert.doesNotThrow(() => checkOwnerOffset(['2026-11-10T14:00:00Z'], undefined), 'no zone: any offset')
  // New York changes offset with DST: the check uses the offset at that moment.
  assert.doesNotThrow(() => checkOwnerOffset(['2026-07-01T09:00:00-04:00', '2026-12-01T09:00:00-05:00'], 'America/New_York'))
})

test('the sample calendar has one double booking and one back-to-back pair for the conflict check (#192)', () => {
  const events = listSampleCalendar({}, Date.parse('2026-11-07T12:00:00Z')).events
  const pairs = (hit: (a: any, b: any) => boolean) => events.flatMap((a, i) => events.slice(i + 1).filter((b) => hit(a, b)).map((b) => [a.id, b.id]))
  assert.deepEqual(pairs((a, b) => b.start < a.end), [['demo-cal-3', 'demo-cal-7']])
  assert.deepEqual(pairs((a, b) => b.start === a.end), [['demo-cal-4', 'demo-cal-8']])
})

// The owner's local times on every event (#214): the model showed the 10:00 UTC standup as 10:00 WIB in 2 of 3 runs.
test('local times: UTC to Asia/Jakarta, a day boundary, all-day events and a UTC owner', () => {
  assert.deepEqual(localTimes('2026-11-11T10:00:00.000Z', '2026-11-11T10:15:00.000Z', false, 'Asia/Jakarta'), { startLocal: 'Wed 11 Nov 17:00', endLocal: 'Wed 11 Nov 17:15', timeZone: 'Asia/Jakarta' })
  // An offset in the source time changes nothing: the same instant reads the same.
  assert.equal(localTimes('2026-11-11T17:00:00+07:00', '2026-11-11T17:15:00+07:00', false, 'Asia/Jakarta').startLocal, 'Wed 11 Nov 17:00')
  // 23:30 UTC is already the next morning in Jakarta, and the weekday moves with it.
  assert.deepEqual(localTimes('2026-11-11T23:30:00Z', '2026-11-12T00:30:00Z', false, 'Asia/Jakarta'), { startLocal: 'Thu 12 Nov 06:30', endLocal: 'Thu 12 Nov 07:30', timeZone: 'Asia/Jakarta' })
  // ...and still the same evening for a UTC owner; behind UTC it is the day before.
  assert.deepEqual(localTimes('2026-11-11T23:30:00Z', '2026-11-12T00:30:00Z', false, 'UTC'), { startLocal: 'Wed 11 Nov 23:30', endLocal: 'Thu 12 Nov 00:30', timeZone: 'UTC' })
  assert.equal(localTimes('2026-11-11T03:00:00Z', '2026-11-11T04:00:00Z', false, 'America/New_York').startLocal, 'Tue 10 Nov 22:00')
  assert.equal(localTimes('2026-11-11T10:00:00Z', '2026-11-11T11:00:00Z', false).timeZone, 'UTC', 'no zone: UTC')
  // All-day: a date, the same day in every zone; Google's end date is exclusive, so endLocal is the last day.
  assert.deepEqual(localTimes('2026-11-10', '2026-11-11', true, 'Asia/Jakarta'), { startLocal: 'Tue 10 Nov, all day', endLocal: 'Tue 10 Nov, all day', timeZone: 'Asia/Jakarta' })
  assert.deepEqual(localTimes('2026-11-10', '2026-11-13', true, 'America/Los_Angeles'), { startLocal: 'Tue 10 Nov, all day', endLocal: 'Thu 12 Nov, all day', timeZone: 'America/Los_Angeles' })
  assert.deepEqual(localTimes('', '', false, 'UTC'), { startLocal: '', endLocal: '', timeZone: 'UTC' })
})

const zoned = (timeZone: string, demo = false) => ({ requestContext: { get: (k: string) => (k === USER_KEY ? 'usr_a' : k === DEMO_KEY ? demo : k === TIME_ZONE_KEY ? timeZone : undefined) } })

test('every calendar tool returns local times in the run\'s time zone (#214)', async () => {
  // Real events: a timed one (10:00+07:00) and an all-day one.
  const real = await run('googlecalendar_list_events', { from: '2026-11-08T00:00:00+07:00', to: '2026-11-15T00:00:00+07:00' }, zoned('Asia/Jakarta'))
  assert.deepEqual(real.events.map((e: any) => [e.id, e.startLocal, e.endLocal, e.timeZone]), [
    ['ev1', 'Sun 8 Nov 10:00', 'Sun 8 Nov 10:15', 'Asia/Jakarta'], ['ev2', 'Tue 10 Nov, all day', 'Tue 10 Nov, all day', 'Asia/Jakarta']])
  assert.equal(real.events[0].start, '2026-11-08T10:00:00+07:00', 'the raw value stays')
  // The sample standup is at 10:00 UTC: 17:00 in Jakarta.
  const sample = await run('googlecalendar_list_events', { query: 'standup' }, zoned('Asia/Jakarta', true))
  assert.equal(sample.events.length, 1)
  assert.match(sample.events[0].startLocal, / 17:00$/)
  assert.match(sample.events[0].start, /T10:00:00\.000Z$/)
  const made = await run('googlecalendar_create_event', { title: 'Dentist', start: '2026-11-09T15:00:00+07:00', end: '2026-11-09T16:00:00+07:00' }, zoned('Asia/Jakarta'))
  assert.deepEqual([made.start, made.startLocal, made.endLocal, made.timeZone], ['2026-11-09T08:00:00Z', 'Mon 9 Nov 15:00', 'Mon 9 Nov 16:00', 'Asia/Jakarta'])
  const met = await run('googlecalendar_create_meeting', { ...meeting, attendees: [], meet: false }, zoned('Asia/Jakarta', true))
  assert.deepEqual([met.startLocal, met.endLocal], ['Tue 10 Nov 15:00', 'Tue 10 Nov 15:30'])
})

// Free time and moving events (#247 item 3).
const exec = (slug: string) => calls.filter((c) => c.body?.tool_slug === slug).map((c) => c.body.arguments)
const day12 = { from: '2026-11-12T00:00:00+07:00', to: '2026-11-13T00:00:00+07:00' }

test('free time: Google\'s busy periods, gaps inside the owner\'s hours on the owner\'s clock, read only', async () => {
  const out = await run('googlecalendar_find_free_time', { ...day12 }, zoned('Asia/Jakarta'))
  assert.deepEqual(exec('GOOGLECALENDAR_FIND_FREE_SLOTS'), [{ items: ['primary'], time_min: '2026-11-11T17:00:00.000Z', time_max: '2026-11-12T17:00:00.000Z', timezone: 'UTC' }])
  assert.equal(out.source, 'googlecalendar')
  assert.deepEqual(out.slots.map((s: any) => [s.startLocal, s.endLocal, s.minutes]), [['Thu 12 Nov 09:00', 'Thu 12 Nov 10:00', 60], ['Thu 12 Nov 11:00', 'Thu 12 Nov 18:00', 420]])
  assert.equal(out.slots[0].start, '2026-11-12T02:00:00.000Z')
  // Longer than the morning gap: only the afternoon. Other hours: the owner asked for the evening.
  const long = await run('googlecalendar_find_free_time', { ...day12, minutes: 90 }, zoned('Asia/Jakarta'))
  assert.deepEqual(long.slots.map((s: any) => s.startLocal), ['Thu 12 Nov 11:00'])
  const evening = await run('googlecalendar_find_free_time', { ...day12, dayStart: '19:00', dayEnd: '22:00' }, zoned('Asia/Jakarta'))
  assert.deepEqual(evening.slots.map((s: any) => [s.startLocal, s.endLocal]), [['Thu 12 Nov 19:00', 'Thu 12 Nov 22:00']])
  await assert.rejects(run('googlecalendar_find_free_time', { ...day12, dayStart: '18:00', dayEnd: '09:00' }, zoned('Asia/Jakarta')), /dayEnd must be after dayStart/)
  assert.equal(needsApproval('googlecalendar_find_free_time'), false)
  assert.equal(nodeIdFor('m1', 'googlecalendar_find_free_time'), 'app:googlecalendar')
  assert.equal(nodeIdFor('m1', 'googlecalendar_move_event'), 'app:googlecalendar')
})

test('free time: a calendar Google could not read is an error, never "all free"; no connection says so', async () => {
  const c = { requestContext: { get: (k: string) => (k === USER_KEY ? 'usr_unreliable' : undefined) } }
  await assert.rejects(run('googlecalendar_find_free_time', { ...day12 }, c), /could not read/)
  await assert.rejects(run('googlecalendar_find_free_time', { ...day12 }, ctx('usr_nocal')), /Google Calendar is not connected/)
})

test('free time: the owner\'s hours follow a clock change, and overlapping busy periods merge', () => {
  // New York leaves summer time on Sun 1 Nov 2026: 09:00 is 13:00Z before, 14:00Z after.
  assert.equal(new Date(zonedInstant('2026-10-30', '09:00', 'America/New_York')).toISOString(), '2026-10-30T13:00:00.000Z')
  assert.equal(new Date(zonedInstant('2026-11-02', '09:00', 'America/New_York')).toISOString(), '2026-11-02T14:00:00.000Z')
  const week = freeSlots([], { timeMin: '2026-11-09T00:00:00Z', timeMax: '2026-11-16T00:00:00Z', minutes: 60, dayStart: '09:00', dayEnd: '17:00', timeZone: 'UTC' })
  assert.equal(week.length, 7)
  // A busy period across the whole window leaves nothing; overlapping busy periods are merged.
  assert.deepEqual(freeSlots([{ start: '2026-11-09T08:00:00Z', end: '2026-11-09T18:00:00Z' }], { timeMin: '2026-11-09T00:00:00Z', timeMax: '2026-11-10T00:00:00Z', minutes: 15, dayStart: '09:00', dayEnd: '17:00', timeZone: 'UTC' }), [])
  assert.deepEqual(freeSlots([{ start: '2026-11-09T10:00:00Z', end: '2026-11-09T12:00:00Z' }, { start: '2026-11-09T11:00:00Z', end: '2026-11-09T11:30:00Z' }], { timeMin: '2026-11-09T00:00:00Z', timeMax: '2026-11-10T00:00:00Z', minutes: 30, dayStart: '09:00', dayEnd: '17:00', timeZone: 'UTC' }).map((s) => [s.start, s.end]),
    [['2026-11-09T09:00:00.000Z', '2026-11-09T10:00:00.000Z'], ['2026-11-09T12:00:00.000Z', '2026-11-09T17:00:00.000Z']])
})

test('free time in a try-out: from the sample calendar, never Composio; no slot overlaps a sample event', async () => {
  const out = await run('googlecalendar_find_free_time', { minutes: 30, maxResults: 30 }, zoned('UTC', true))
  assert.equal(out.source, 'sample_calendar')
  assert.equal(calls.length, 0)
  assert.ok(out.slots.length > 0)
  const events = listSampleCalendar({}).events
  for (const s of out.slots) for (const e of events) assert.ok(!(s.start < e.end && e.start < s.end), `${s.start} overlaps ${e.title}`)
})

const move = { eventId: 'mv1', title: 'Client call', oldStart: '2026-11-12T15:00:00+07:00', oldEnd: '2026-11-12T16:00:00+07:00', newStart: '2026-11-12T16:00:00+07:00', newEnd: '2026-11-12T17:00:00+07:00' }
const tool = () => (toolRegistry as any).googlecalendar_move_event
// beforeApproval gets a plain object view of the request context.
const view = (userId = 'usr_a', demo = false) => ({ requestContext: { [USER_KEY]: userId, [DEMO_KEY]: demo, [TIME_ZONE_KEY]: 'Asia/Jakarta' } })

test('move: read the event, then patch only its start and end; no attendees sent, nobody emailed; it needs approval', async () => {
  resetEvents()
  assert.equal(needsApproval('googlecalendar_move_event'), true)
  assert.equal(await tool().beforeApproval(move, view()), undefined, 'the event is at the old time: the card is shown')
  calls.length = 0
  const out = await run('googlecalendar_move_event', move, zoned('Asia/Jakarta'))
  assert.deepEqual(calls.filter((c) => c.body?.tool_slug).map((c) => c.body.tool_slug), ['GOOGLECALENDAR_EVENTS_GET', 'GOOGLECALENDAR_PATCH_EVENT'], 'read again just before writing')
  assert.deepEqual(exec('GOOGLECALENDAR_EVENTS_GET'), [{ calendar_id: 'primary', event_id: 'mv1' }])
  assert.deepEqual(exec('GOOGLECALENDAR_PATCH_EVENT'), [{ calendar_id: 'primary', event_id: 'mv1', start_time: '2026-11-12T16:00:00+07:00', end_time: '2026-11-12T17:00:00+07:00', send_updates: 'none' }])
  assert.deepEqual([out.status, out.title, out.startLocal, out.endLocal, out.guests, out.guestsEmailed, out.link], ['moved', 'Client call', 'Thu 12 Nov 16:00', 'Thu 12 Nov 17:00', 1, false, 'https://calendar.example/mv1'])
  // The same instant written in UTC is the same old time.
  calls.length = 0
  const utc = await run('googlecalendar_move_event', { ...move, oldStart: '2026-11-12T08:00:00Z', oldEnd: '2026-11-12T09:00:00.000Z' }, zoned('Asia/Jakarta'))
  assert.equal(utc.status, 'moved')
})

test('move: an event no longer at the old time is refused before the card and again before writing; nothing is patched', async () => {
  resetEvents()
  const stale = { ...move, oldStart: '2026-11-12T14:00:00+07:00', oldEnd: '2026-11-12T15:00:00+07:00' }
  const before = await tool().beforeApproval(stale, view())
  assert.equal(before.proceed, false)
  assert.equal(before.output.status, 'refused')
  assert.match(before.output.message, /no longer at the time shown/)
  // Moved in Google Calendar after the card was shown: execute reads again and refuses.
  assert.equal(await tool().beforeApproval(move, view()), undefined)
  EVENTS.mv1.start.dateTime = '2026-11-12T13:00:00+07:00'
  calls.length = 0
  const out = await run('googlecalendar_move_event', move, zoned('Asia/Jakarta'))
  assert.equal(out.status, 'refused')
  assert.deepEqual(exec('GOOGLECALENDAR_PATCH_EVENT'), [])
  resetEvents()
})

test('move: refused for an event the owner is only a guest on, an all-day event, a missing event, or the same time', async () => {
  resetEvents()
  const guest = await tool().beforeApproval({ ...move, eventId: 'guest1' }, view())
  assert.match(guest.output.message, /guest on this event/)
  assert.match((await run('googlecalendar_move_event', { ...move, eventId: 'guest1' }, zoned('Asia/Jakarta'))).message, /guest on this event/)
  assert.match((await tool().beforeApproval({ ...move, eventId: 'allday1' }, view())).output.message, /all-day/)
  assert.match((await tool().beforeApproval({ ...move, eventId: 'nope' }, view())).output.message, /Not Found/)
  calls.length = 0
  const same = await tool().beforeApproval({ ...move, newStart: move.oldStart, newEnd: move.oldEnd }, view())
  assert.match(same.output.message, /same as the old one/)
  assert.equal(calls.length, 0)
  assert.deepEqual(exec('GOOGLECALENDAR_PATCH_EVENT'), [])
})

test('move: new times carry the owner\'s offset, end after start, at most 24 hours; old times are ISO with an offset', async () => {
  resetEvents()
  await assert.rejects(run('googlecalendar_move_event', { ...move, newStart: '2026-11-12T16:00:00+00:00', newEnd: '2026-11-12T17:00:00+00:00' }, zoned('Asia/Jakarta')), /not in the owner's time zone/)
  await assert.rejects(run('googlecalendar_move_event', { ...move, newEnd: '2026-11-12T15:30:00+07:00' }, zoned('Asia/Jakarta')), /end after it starts/)
  const schema = tool().inputSchema
  assert.equal(schema.safeParse({ ...move, oldStart: '2026-11-12' }).success, false, 'an all-day date is not a time')
  assert.equal(schema.safeParse({ ...move, oldStart: 'tomorrow 3pm' }).success, false)
  assert.equal(schema.safeParse(move).success, true)
  assert.deepEqual(exec('GOOGLECALENDAR_PATCH_EVENT'), [])
})

test('move in a try-out: the sample event at its sample time moves on paper only; never Composio', async () => {
  const focus = listSampleCalendar({ query: 'Focus time' }).events[0]
  const later = (t: string) => new Date(Date.parse(t) + 4 * 3600_000).toISOString()
  const input = { eventId: focus.id, title: focus.title, oldStart: focus.start, oldEnd: focus.end, newStart: later(focus.start), newEnd: later(focus.end) }
  const c = { requestContext: { get: (k: string) => (k === USER_KEY ? 'usr_demo' : k === DEMO_KEY ? true : undefined) } }
  assert.equal(await tool().beforeApproval(input, { requestContext: { [USER_KEY]: 'usr_demo', [DEMO_KEY]: true } }), undefined)
  const out = await run('googlecalendar_move_event', input, c)
  assert.deepEqual([out.source, out.status, out.start, out.guestsEmailed], ['sample_calendar', 'moved', input.newStart, false])
  const wrong = await run('googlecalendar_move_event', { ...input, oldStart: later(focus.start), oldEnd: later(focus.end), newStart: later(later(focus.start)), newEnd: later(later(focus.end)) }, c)
  assert.equal(wrong.status, 'refused')
  assert.equal(calls.length, 0)
})

test('move is a #167 switch: a rule can cover it; try-outs always ask', () => {
  assert.equal(ruleFor('googlecalendar_move_event', move, { autoApprove: { tools: ['googlecalendar_move_event'] } }), 'tool')
  assert.equal(ruleFor('googlecalendar_move_event', move, { autoApprove: { tools: ['googlecalendar_move_event'] }, demo: true }), null)
  assert.equal(ruleFor('googlecalendar_find_free_time', {}, { autoApprove: { tools: ['googlecalendar_move_event'] } }), null)
})
