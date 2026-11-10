// Measures how a Payments Mind answers greetings and small talk (#205): which tools each chat called, how long it
// took and what it said. Controls ("jam berapa sekarang?", "rencanakan hariku") must still call their tools.
// Live NEAR AI calls (costs credit) and the local Postgres; runs the engine in-process, never on port 4100.
//
// Run from engine/:   node --env-file=.env --import tsx scripts/measure-greetings.mts [--runs 3] [--engine <dir>] [--json out.json]
// --engine points at another checkout's engine/ (for example a worktree of main) with its own node_modules, so the
// same script measures main and this branch. It only uses what both have: src/server.ts, src/models.ts and
// templates/payments-mind.json.
import { readFileSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { runs: { type: 'string', default: '3' }, engine: { type: 'string' }, json: { type: 'string' } } })
const runs = Number(args.runs)
const engineDir = resolve(args.engine ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const key = process.env.ENGINE_API_KEY
if (!key) throw new Error('ENGINE_API_KEY is not set: run with node --env-file=.env')

const prompts = [
  { message: 'halo', control: false },
  { message: 'hai, apa kabar?', control: false },
  { message: 'terima kasih', control: false },
  { message: 'jam berapa sekarang?', control: true },
  { message: 'rencanakan hariku', control: true },
]

const template = JSON.parse(readFileSync(resolve(engineDir, 'templates/payments-mind.json'), 'utf8'))
const mind = { templateId: template.templateId, name: 'Omaga', soul: template.soul, model: template.model, skills: template.skills.map((skillId: string) => ({ skillId })) }

const { server } = await import(pathToFileURL(resolve(engineDir, 'src/server.ts')).href)
const { warmAttestation } = await import(pathToFileURL(resolve(engineDir, 'src/models.ts')).href)
// The first attestation check is cold (over 10 s); warm it so the first chat is timed like the others.
await warmAttestation([mind.model])
await new Promise<void>((r) => server.listen(0, r))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

type Ev = Record<string, any>
type Result = { message: string; control: boolean; run: number; seconds: number; tools: string[]; steps: number; text: string; error?: string }
const results: Result[] = []

console.log(`engine: ${engineDir}\nmodel: ${mind.model}, skills: ${template.skills.join(', ')}, runs per prompt: ${runs}\n`)
for (const p of prompts) {
  for (let run = 1; run <= runs; run++) {
    // A fresh owner and thread per chat, so working memory from one chat never steers the next.
    const started = Date.now()
    const res = await fetch(`${base}/v1/minds/mnd_measure/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-engine-key': key },
      body: JSON.stringify({ userId: `measure-${randomUUID()}`, threadId: randomUUID(), message: p.message, mind, demo: true, timeZone: 'Asia/Jakarta' }),
    })
    const body = await res.text()
    const seconds = (Date.now() - started) / 1000
    const evs: Ev[] = body.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
    const r: Result = {
      ...p, run, seconds,
      tools: evs.filter((e) => e.type === 'tool.called').map((e) => e.tool === 'skill' ? `skill:${e.args?.name ?? '?'}` : e.tool),
      steps: evs.filter((e) => e.type === 'step.started').length,
      text: evs.find((e) => e.type === 'run.finished')?.text ?? '',
      error: res.status !== 200 ? `HTTP ${res.status}: ${body.slice(0, 200)}` : evs.find((e) => e.type === 'run.error')?.error,
    }
    results.push(r)
    console.log(`"${p.message}" #${run}: ${seconds.toFixed(1)} s, ${r.steps} steps, tools: ${r.tools.join(', ') || '(none)'}${r.error ? `, ERROR ${r.error}` : ''}`)
    console.log(`  ${r.text.replace(/\s+/g, ' ').trim()}\n`)
  }
}

console.log('summary (per prompt: average seconds, chats with no tool call, tools seen)')
for (const p of prompts) {
  const rs = results.filter((r) => r.message === p.message)
  const avg = rs.reduce((s, r) => s + r.seconds, 0) / rs.length
  const none = rs.filter((r) => r.tools.length === 0).length
  console.log(`  ${p.control ? 'control ' : 'greeting'} "${p.message}": ${avg.toFixed(1)} s avg, ${none}/${rs.length} without tools, tools: ${[...new Set(rs.flatMap((r) => r.tools))].join(', ') || '(none)'}`)
}
if (args.json) writeFileSync(args.json, JSON.stringify({ engineDir, model: mind.model, runs, results }, null, 2))

await new Promise<void>((r) => server.close(() => r()))
// Postgres pools keep the process alive otherwise.
process.exit(0)
