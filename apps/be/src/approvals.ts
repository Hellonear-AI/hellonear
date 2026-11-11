// What an approval asks, in words, for places outside the web app (Telegram, #208). Ported from the app's approval card so
// both say the same thing: the payment checks from apps/fe `modules/wallet/data/checks.ts` (read against the stored
// policy and balance) and the details of other approvals from apps/fe `modules/runs/data/approvalDetails.ts`. The
// checks mirror what OutLayer enforces in its TEE; they don't replace it, they say in advance what it will do.
// Keep the words in step with those two files.

export type Check = { ok: boolean; text: string }
// What the main button does: approve, or fix what would block it first (the app's "fix first" rule). `fund`: the wallet
// holds less than the payment, so it would fail even if approved (an unfunded wallet's account isn't on chain yet, #228).
export type NextStep = 'approve' | 'add_address' | 'change_limits' | 'unfreeze' | 'fund'
export type Payment = { to: string; amountNear: string }
// The parts of `getWallet` (src/wallets.ts) the checks read.
// `spentTodayNear` and `dailyNear` (#149) are optional so a wallet read without them simply skips the daily check.
export type WalletView = {
  balanceNear: string
  spentTodayNear?: string
  frozen: boolean
  policy: null | { perTransactionNear: string | null; dailyNear?: string | null; whitelist: string[] | null }
}

const DECIMAL = /^\d+(\.\d+)?$/

// -1, 0 or 1 like a sort comparator; null when either side isn't a plain decimal. No floats, so 24 decimals stay exact.
export function compareNear(a: string, b: string): -1 | 0 | 1 | null {
  if (!DECIMAL.test(a.trim()) || !DECIMAL.test(b.trim())) return null
  const parts = (v: string) => {
    const [whole = '', frac = ''] = v.trim().split('.')
    return [whole.replace(/^0+/, ''), frac.padEnd(24, '0').slice(0, 24)] as const
  }
  const [aw, af] = parts(a)
  const [bw, bf] = parts(b)
  if (aw.length !== bw.length) return aw.length > bw.length ? 1 : -1
  if (aw !== bw) return aw > bw ? 1 : -1
  return af === bf ? 0 : af > bf ? 1 : -1
}

// Exact sum and difference of decimal NEAR strings (24 decimals), like the app's `addNear` / `subNear`; a difference
// below 0 is "0". Callers check DECIMAL first.
const toYocto = (v: string) => {
  const [whole = '0', frac = ''] = v.trim().split('.')
  return BigInt(whole + frac.padEnd(24, '0').slice(0, 24))
}
const fromYocto = (y: bigint) => {
  const digits = (y < 0n ? 0n : y).toString().padStart(25, '0')
  const frac = digits.slice(-24).replace(/0+$/, '')
  return frac ? `${digits.slice(0, -24)}.${frac}` : digits.slice(0, -24)
}
export const addNear = (a: string, b: string) => fromYocto(toYocto(a) + toYocto(b))
export const subNear = (a: string, b: string) => fromYocto(toYocto(a) - toYocto(b))

// The daily cap (#149): OutLayer refuses when what it counted today plus this payment is over the cap (a payment that
// lands exactly on it goes through, testnet 10 Nov). Its day starts at 00:00 UTC (testnet 11 Nov). null: no cap set, or
// a value that isn't a plain decimal, so there is nothing to say in advance.
export function dailyCheck(payment: Payment, wallet: Pick<WalletView, 'spentTodayNear' | 'policy'> | null): { over: boolean; daily: string; left: string } | null {
  const daily = wallet?.policy?.dailyNear
  const spent = wallet?.spentTodayNear
  if (!daily || spent === undefined || ![daily, spent, payment.amountNear].every((v) => DECIMAL.test(v.trim()))) return null
  return { over: compareNear(addNear(spent, payment.amountNear), daily) === 1, daily, left: subNear(daily, spent) }
}

// "1234.5" -> "1,234.50", like the app's balance.
export function formatNear(amount: string): string {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(amount.trim())
  if (!match) return amount
  const whole = match[1].replace(/^0+(?=\d)/, '')
  const cents = (match[2] ?? '').padEnd(2, '0').slice(0, 2)
  return `${Number(whole).toLocaleString('en-US')}.${cents}`
}

export function approvalChecks(payment: Payment, wallet: WalletView | null): { checks: Check[]; next: NextStep } {
  const checks: Check[] = []
  let next: NextStep = 'approve'
  if (!wallet) return { checks, next }

  if (wallet.frozen) {
    checks.push({ ok: false, text: 'Wallet frozen: blocked until you unfreeze it' })
    next = 'unfreeze'
  }

  const limit = wallet.policy?.perTransactionNear
  if (limit) {
    const over = compareNear(payment.amountNear, limit) === 1
    checks.push(over ? { ok: false, text: `Over your ${limit} NEAR limit: blocked even if you approve` } : { ok: true, text: `Within your ${limit} NEAR limit` })
    if (over && next === 'approve') next = 'change_limits'
  }

  const day = dailyCheck(payment, wallet)
  if (day) {
    checks.push(day.over ? { ok: false, text: `Over today's ${day.daily} NEAR limit (${formatNear(day.left)} left): blocked even if you approve` } : { ok: true, text: `Within today's ${day.daily} NEAR limit` })
    if (day.over && next === 'approve') next = 'change_limits'
  }

  const list = wallet.policy?.whitelist
  if (list) {
    const listed = list.includes(payment.to.toLowerCase())
    checks.push(listed ? { ok: true, text: 'On your list of addresses' } : { ok: false, text: 'Not on your list: blocked even if you approve' })
    if (!listed && next === 'approve') next = 'add_address'
  }

  // An unfunded wallet reads as balance "0" (OutLayer answers 200 for it, spike 01), so it counts as not enough.
  const enough = compareNear(wallet.balanceNear, payment.amountNear)
  if (enough !== null) {
    const balance = formatNear(wallet.balanceNear)
    checks.push(enough >= 0 ? { ok: true, text: `Enough balance: ${balance} NEAR` } : { ok: false, text: `Not enough balance: ${balance} NEAR` })
    if (enough < 0 && next === 'approve') next = 'fund'
  }

  return { checks, next }
}

// The app's "fix first" button words.
export const fixFirstLabel = (next: Exclude<NextStep, 'approve'>) =>
  next === 'unfreeze' ? 'Unfreeze first' : next === 'add_address' ? 'Add the address first' : next === 'fund' ? "Add NEAR to this Mind's wallet first" : 'Change limits first'

// Which of the owner's limits a refused payment broke, read against the wallet's stored policy.
export const NOT_LISTED = 'Not on your list of addresses'
// A refused payment doesn't count toward today's total, so the daily check still holds after the refusal.
export function refusalReasons(payment: Payment, wallet: Pick<WalletView, 'spentTodayNear' | 'policy'> | null): string[] {
  const reasons: string[] = []
  const policy = wallet?.policy ?? null
  if (policy?.whitelist && !policy.whitelist.includes(payment.to.toLowerCase())) reasons.push(NOT_LISTED)
  if (policy?.perTransactionNear && compareNear(payment.amountNear, policy.perTransactionNear) === 1) reasons.push(`Over ${policy.perTransactionNear} NEAR per payment`)
  if (dailyCheck(payment, wallet)?.over) reasons.push(`Over today's ${policy?.dailyNear} NEAR limit`)
  return reasons
}

// The payment a `send_payment` approval asks for, from its args.
export function paymentOf(tool: string, args: unknown): Payment | null {
  if (tool !== 'send_payment') return null
  const a = (args ?? {}) as Record<string, unknown>
  return typeof a.to === 'string' && typeof a.amountNear === 'string' ? { to: a.to, amountNear: a.amountNear } : null
}

export type ApprovalDetails = { title: string; lines: { label: string; value: string }[]; note?: string }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [])

// "Tue 11 Nov, 14:00 to 15:00", or the end's date too when it falls on another day.
export function whenText(start: unknown, end: unknown, timeZone?: string): string | null {
  const s = str(start) ? new Date(start as string) : null
  if (!s || Number.isNaN(s.getTime())) return null
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone })
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })
  const from = `${day.format(s)}, ${time.format(s)}`
  const e = str(end) ? new Date(end as string) : null
  if (!e || Number.isNaN(e.getTime())) return from
  return day.format(e) === day.format(s) ? `${from} to ${time.format(e)}` : `${from} to ${day.format(e)}, ${time.format(e)}`
}

// Details for tools other than send_payment, from the tool's own arguments (engine/src/tools.ts input schemas).
// `timeZone` names the clock times are shown on; Telegram sends none, so the caller passes UTC and says so.
export function approvalDetails(tool: string, args: unknown, timeZone?: string): ApprovalDetails | null {
  const a = (args ?? {}) as Record<string, unknown>
  switch (tool) {
    case 'googlecalendar_create_event': {
      const when = whenText(a.start, a.end, timeZone)
      const lines = [when && { label: 'When', value: when }, str(a.location) && { label: 'Where', value: str(a.location)! }]
      return { title: `Add "${str(a.title) ?? 'an event'}" to your calendar`, lines: lines.filter((l) => !!l) as ApprovalDetails['lines'] }
    }
    case 'googlecalendar_create_meeting': {
      const guests = list(a.attendees)
      const when = whenText(a.start, a.end, timeZone)
      const lines: ApprovalDetails['lines'] = []
      if (when) lines.push({ label: 'When', value: when })
      lines.push({ label: 'Guests', value: guests.length ? guests.join(', ') : 'No guests' })
      lines.push({ label: 'Video', value: a.meet === true ? 'A Google Meet link' : 'No video link' })
      if (str(a.location)) lines.push({ label: 'Where', value: str(a.location)! })
      return {
        title: `Schedule "${str(a.title) ?? 'a meeting'}"`,
        lines,
        note: guests.length
          ? `Adds it to your Google Calendar, and Google emails ${guests.length === 1 ? 'this guest' : 'each guest'} an invite in your name.`
          : 'Adds it to your Google Calendar.',
      }
    }
    case 'gmail_organize': {
      const emails = Array.isArray(a.emails) ? (a.emails as Record<string, unknown>[]) : []
      const n = emails.length
      const noun = n === 1 ? 'email' : 'emails'
      const what = a.action === 'label' ? `Label ${n} ${noun} "${str(a.label) ?? ''}"` : a.action === 'label_and_archive' ? `Label ${n} ${noun} "${str(a.label) ?? ''}" and archive them` : `Archive ${n} ${noun}`
      return {
        title: what,
        lines: emails.map((e, i) => {
          const from = str(e.from)?.replace(/\s*<[^>]*>\s*$/, '').replace(/^"|"$/g, '') || str(e.from) || 'Unknown sender'
          return { label: `${i + 1}`, value: `${from}: ${str(e.subject) ?? '(no subject)'}` }
        }),
        note: a.action === 'label'
          ? `Adds the label in your Gmail; ${n === 1 ? 'it stays' : 'they stay'} in your inbox.`
          : `Takes ${n === 1 ? 'it' : 'them'} out of your inbox; ${n === 1 ? 'it stays' : 'they stay'} in All Mail. Nothing is deleted.`,
      }
    }
    case 'mail_send': {
      const to = list(a.to)
      return { title: `Send "${str(a.subject) ?? 'an email'}"`, lines: [{ label: 'To', value: to.length ? to.join(', ') : 'Nobody yet' }], note: "It goes from your Mind's own email address." }
    }
    default:
      return null
  }
}

// A testnet transaction on NearBlocks (the explorer docs.near.org links for testnet; the app links the same).
export const explorerTxUrl = (txHash: string) => `https://testnet.nearblocks.io/txns/${encodeURIComponent(txHash)}`
