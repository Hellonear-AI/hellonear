// Live prompt test for #214, against real NEAR AI Cloud and the local Postgres. Run:
//   node --env-file=.env --import tsx --test test/calendar-local-times.test.ts
// Three identical try-out runs (`demo: true`, timeZone Asia/Jakarta) of a day plan. The sample standup is at 10:00 UTC,
// which is 17:00 in Jakarta: before #214 it read 17:00 once and 10:00 twice, and one run listed made-up events
// ("05:00 wake up") as part of the plan. "The next two days" always covers the standup (it is 10 to 34 hours ahead of
// now in UTC), whatever the hour the test runs.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { server } from '../src/server.ts'

let base = ''
const key = process.env.ENGINE_API_KEY!
const userId = `test-user-${randomUUID()}`

before(async () => {
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => new Promise<void>((r) => server.close(() => r())))

type Ev = Record<string, any>
async function post(path: string, body: unknown) {
  return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-key': key }, body: JSON.stringify(body) })
}
async function events(res: Response): Promise<Ev[]> {
  assert.equal(res.status, 200, await res.clone().text())
  const text = await res.text()
  return text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
}
const finalText = (evs: Ev[]) => evs.find((e) => e.type === 'run.finished')?.text ?? ''
const toolTrail = (evs: Ev[]) => evs.filter((e) => e.tool).map((e) => `${e.type}:${e.tool}`)
const mind = {
  templateId: 'general-assistant',
  name: 'Ava',
  soul: { identity: 'A helpful assistant for a small business owner.', invariants: ['Never invent facts.'], priors: [] },
  skills: [{ skillId: 'daily-planner' }],
}

// Words from the sample calendar's titles (src/calendar.ts SAMPLE_CALENDAR): a timed line in the plan that names none
// of them, outside a Suggestions part and without calling itself a suggestion, is an invented event.
const CALENDAR_TITLES = /standup|kopi kita|client call|focus time|demo video|design review|bean co|lunch with rina|supplier call|account review|demo day|submissions/i
const TIMED = /\b\d{1,2}[:.]\d{2}\b/
const HEADING = /^\s*(#{1,6}\s|\*\*[^*]+\*\*\s*:?\s*$|[A-Za-z][^:]{0,40}:\s*$)/
const SUGGESTION = /suggest|saran|\bfree\b|open slot|\bbreak\b|optional/i

function inventedEvents(text: string): string[] {
  let inSuggestions = false
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (HEADING.test(line)) inSuggestions = SUGGESTION.test(line)
    if (!TIMED.test(line) || inSuggestions || SUGGESTION.test(line) || CALENDAR_TITLES.test(line)) continue
    out.push(line.trim())
  }
  return out
}

for (const n of [1, 2, 3]) {
  test(`plan run ${n}/3: the standup reads 17:00 in Jakarta and nothing off the calendar is listed as an event`, async () => {
    const evs = await events(await post(`/v1/minds/${randomUUID()}/chat`, {
      userId, threadId: randomUUID(), demo: true, timeZone: 'Asia/Jakarta', mind, message: 'Plan my next two days from my calendar.',
    }))
    const text: string = finalText(evs)
    console.log(`  reply: ${text.replace(/\s+/g, ' ').slice(0, 500)}`)
    const listed = evs.find((e) => e.type === 'tool.result' && e.tool === 'googlecalendar_list_events')
    assert.ok(listed, JSON.stringify(toolTrail(evs)))
    assert.equal(listed.result.source, 'sample_calendar')
    const standup = listed.result.events.find((e: any) => e.id === 'demo-cal-1')
    assert.ok(standup, 'the listed range covers the standup')
    assert.match(standup.startLocal, / 17:00$/, 'the tool gives the local time')
    assert.equal(standup.timeZone, 'Asia/Jakarta')

    // Only lines that give the standup a time: a suggestion such as "keep a break after the standup" names it without one
    // (seen 11 Nov, and the time on the event line was right).
    const lines = text.split('\n').filter((l) => /standup/i.test(l) && /\b\d{1,2}[:.]\d{2}\b/.test(l))
    assert.ok(lines.length > 0, 'the plan mentions the standup')
    for (const line of lines) {
      assert.match(line, /17[:.]00/, `standup at 17:00: ${line}`)
      assert.doesNotMatch(line, /^\W*10[:.]00/, `never the UTC time as the local one: ${line}`)
    }
    assert.deepEqual(inventedEvents(text), [], 'anything not on the calendar is labelled a suggestion')
  })
}
