// Live prompt tests for the connection skills (#194) and the Calendar conflict check (#192), against real NEAR AI Cloud
// and the local Postgres. Run: node --env-file=.env --import tsx --test test/skills-connections.test.ts
// Every run is a try-out run (`demo: true`): the conflict check reads the sample calendar, and the app skills have no
// sample, so they must say the app is not available instead of inventing results. Runs against a real connected
// account wait for a human to connect a test account (agents never sign in).
import { after, before, describe, test } from 'node:test'
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
const mind = (name: string, skills: string[]) => ({
  templateId: 'general-assistant',
  name,
  soul: { identity: 'A helpful assistant for a small business owner.', invariants: ['Never invent facts.'], priors: [] },
  skills: skills.map((skillId) => ({ skillId })),
})
const chat = async (skills: string[], message: string) => {
  const evs = await events(await post(`/v1/minds/${randomUUID()}/chat`, { userId, threadId: randomUUID(), demo: true, timeZone: 'UTC', mind: mind('Ava', skills), message }))
  console.log(`  reply: ${finalText(evs).replace(/\s+/g, ' ').slice(0, 400)}`)
  return evs
}

describe('Calendar conflict check (#192)', () => {
  test('finds the sample double booking and back-to-back pair, suggests moves, changes nothing', async () => {
    const evs = await chat(['calendar-conflicts'], 'Check my calendar for the next 7 days: any double bookings or back-to-back meetings?')
    const listed = evs.find((e) => e.type === 'tool.result' && e.tool === 'googlecalendar_list_events')
    assert.ok(listed, JSON.stringify(toolTrail(evs)))
    assert.equal(listed.result.source, 'sample_calendar')
    assert.ok(!evs.some((e) => e.type === 'tool.approval_required'), `no write without being asked: ${JSON.stringify(toolTrail(evs))}`)
    const text = finalText(evs)
    assert.match(text, /design review/i, 'names the double booking')
    assert.match(text, /focus time/i, 'names what it overlaps')
    assert.match(text, /supplier call/i, 'names the back-to-back meeting')
    assert.match(text, /sample/i, 'says it is the sample calendar')
    assert.doesNotMatch(text, /\b(moved|rescheduled|cancel(l)?ed) (it|the|your)\b/i, 'never claims it changed the calendar')
  })

  test('a Mind without the skill does not claim it and names the skill to add', async () => {
    const evs = await chat(['payments'], 'Can you check my calendar for double bookings this week?')
    assert.ok(!evs.some((e) => e.type === 'tool.called' && String(e.tool).startsWith('googlecalendar_')), JSON.stringify(toolTrail(evs)))
    assert.match(finalText(evs), /calendar conflict check/i)
  })
})

describe('connection skills in the try-out (#194)', () => {
  // Each skill must reach for its own app's tool, then say plainly the app is not available, with no approval card and
  // no made-up result.
  const cases: [string, string, RegExp][] = [
    ['sheets', 'Add a row to my Expenses spreadsheet: 2026-11-11, hosting, 0.02.', /^googlesheets_/],
    ['docs', 'What does my contract document in Google Drive say about payment terms?', /^google(drive|docs)_/],
    ['slack', 'Post "Invoices are paid" to the #finance channel in Slack.', /^slack_/],
    ['notion', 'Find my CRM page in Notion and tell me what is on it.', /^notion_/],
    ['outlook', 'Sum up my Outlook inbox.', /^outlook_/],
  ]
  for (const [skill, message, toolPrefix] of cases) {
    test(`${skill}: uses its own tool and says the app is not available, inventing nothing`, async () => {
      const evs = await chat([skill], message)
      const failed = evs.find((e) => e.type === 'tool.error' && toolPrefix.test(String(e.tool)))
      assert.ok(failed, JSON.stringify(toolTrail(evs)))
      assert.match(failed.error, /not available in the try-out/)
      // Each playbook reads first (find the sheet, list channels, …), so the try-out answer comes before any approval card.
      assert.ok(!evs.some((e) => e.type === 'tool.approval_required'), JSON.stringify(toolTrail(evs)))
      const text = finalText(evs)
      assert.match(text, /try-out|not available|connect/i)
      assert.doesNotMatch(text, /\b(row (was )?added|posted to|draft saved|page created)\b/i, 'never claims a write happened')
    })
  }
})
