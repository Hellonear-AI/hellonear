// Limits on Autopilot (#21), so one owner cannot spend the shared NEAR AI credit with nobody watching:
// how often a schedule may fire, how many schedules may be on, and how many scheduled runs start per UTC day.
// Hackathon phase only: on testnet the team's credit pays for every run. On mainnet owners pay for their own runs from
// their own credits (pay as you go), and these limits are replaced by the owner's balance.
// Pure functions, no network or database (the scheduler hook takes the store it guards).

const int = (name: string, fallback: number) => {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n > 0 ? n : fallback
}
// Read per call, so the integration and load tests can allow a fire every minute on a local engine.
export const limits = {
  // A schedule fires at most 4 times an hour.
  get minGapMinutes() { return int('AUTOPILOT_MIN_GAP_MINUTES', 15) },
  get perMind() { return int('AUTOPILOT_MAX_PER_MIND', 5) },
  get perUser() { return int('AUTOPILOT_MAX_PER_USER', 10) },
  get firesPerDay() { return int('AUTOPILOT_MAX_FIRES_PER_DAY', 100) },
}

// The minutes of the hour a cron minute field fires on, or null if it is not plain numbers, `*`, lists, ranges and
// steps (`5`, `*`, `*/15`, `0,30`, `10-40`, `0-59/20`, `5/10` = from 5 to 59).
export function fireMinutes(field: string): number[] | null {
  const minutes = new Set<number>()
  for (const part of field.split(',')) {
    const m = part.match(/^(?:(\*)|(\d{1,2})(?:-(\d{1,2}))?)(?:\/(\d{1,2}))?$/)
    if (!m) return null
    const step = m[4] === undefined ? 1 : Number(m[4])
    const from = m[1] ? 0 : Number(m[2])
    const to = m[1] ? 59 : m[3] !== undefined ? Number(m[3]) : m[4] !== undefined ? 59 : from
    if (step < 1 || from > 59 || to > 59 || from > to) return null
    for (let i = from; i <= to; i += step) minutes.add(i)
  }
  return [...minutes].sort((a, b) => a - b)
}

export type CronIssue = { code: 'too_frequent' | 'invalid_schedule'; message: string }

// Why a 5-field cron fires too often, if it does. Only the minute field is read: every gap between two fire minutes,
// including the one across the top of the hour, must be at least `minGap`. That is stricter than the cron library
// Mastra uses (croner) would need: `0,50 9 * * *` is refused though it fires twice a day, 50 minutes apart. Croner is
// a transitive package here (not ours to import, versions are pinned), and no schedule the app's own Builder makes
// has more than one fire minute, so the simple rule costs owners nothing and can never let a fast cron through.
export function cronIssue(cron: string, minGap = limits.minGapMinutes): CronIssue | null {
  const fields = cron.trim().split(/\s+/)
  const minutes = fields.length === 5 ? fireMinutes(fields[0]) : null
  if (!minutes?.length) return { code: 'invalid_schedule', message: 'the schedule must be a 5-field cron whose minute field is numbers, lists, ranges or steps' }
  const tooClose = minutes.some((m, i) => (i ? m - minutes[i - 1] : m + 60 - minutes[minutes.length - 1]) < minGap)
  if (!tooClose) return null
  return { code: 'too_frequent', message: `Autopilot runs at most ${Math.floor(60 / minGap)} times an hour, at least ${minGap} minutes apart. Choose a schedule that runs less often.` }
}

type Counted = { id: string; mindId?: string; userId?: string }
// Why one more schedule cannot be turned on, given the active ones (the schedule being turned on left out).
export function capIssue(active: Counted[], mindId: string, userId: string, max = { perMind: limits.perMind, perUser: limits.perUser }) {
  if (active.filter((s) => s.mindId === mindId).length >= max.perMind) return { code: 'too_many_schedules' as const, message: `A Mind can have at most ${max.perMind} Autopilot jobs turned on. Turn one off first.` }
  if (active.filter((s) => s.userId === userId).length >= max.perUser) return { code: 'too_many_schedules' as const, message: `You can have at most ${max.perUser} Autopilot jobs turned on across your Minds. Turn one off first.` }
  return null
}

// Counts per key and UTC day, in memory: the engine is one process (Mastra allows only one scheduler), so a restart
// or deploy starts the day's count again. Enough to stop a runaway day; not an exact quota.
export function dailyCounter(limit = () => limits.firesPerDay, now = () => Date.now()) {
  let day = ''
  const counts = new Map<string, number>()
  return {
    // True and counted when the key is still under the limit today.
    take(key: string): boolean {
      const today = new Date(now()).toISOString().slice(0, 10)
      if (today !== day) { day = today; counts.clear() }
      const n = counts.get(key) ?? 0
      if (n >= limit()) return false
      counts.set(key, n + 1)
      return true
    },
  }
}

type ClaimStore = { updateScheduleNextFire: (id: string, ...rest: never[]) => Promise<boolean> }
// The daily cap, where a scheduled fire starts: Mastra's scheduler claims each due fire with
// updateScheduleNextFire (it moves nextFireAt on) and starts the run only if that returns true (read in
// @mastra/core 1.81.0 dist/scheduler-*.js, #fireSchedule; there is no hook before a workflow fire). Here the claim
// still happens, so the schedule moves to its next time, but over the cap it answers false: no run starts.
// `keyOf` names who the fire counts for; if it fails the fire counts for the schedule itself, never for nobody.
export function capFires<S extends ClaimStore>(store: S, keyOf: (scheduleId: string) => Promise<string | null>, counter = dailyCounter(), log: (line: string) => void = console.warn): S {
  const claim = store.updateScheduleNextFire.bind(store)
  store.updateScheduleNextFire = async (id, ...rest) => {
    if (!(await claim(id, ...rest))) return false
    const key = await keyOf(id).catch(() => `schedule:${id}`)
    // Not an Autopilot schedule: not ours to limit.
    if (key === null) return true
    if (counter.take(key)) return true
    log(`autopilot: daily limit of scheduled runs reached, skipped a fire of ${id}`)
    return false
  }
  return store
}
