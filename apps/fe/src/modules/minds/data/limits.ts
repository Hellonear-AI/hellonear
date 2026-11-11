// The spending limits of a new Mind (design L3), checked as the user types. They match what
// the backend accepts for policy v2 (apps/be/src/wallets.ts): a per-payment limit above 0 and
// at most 10 NEAR, and 1 to 20 NEAR accounts that may be paid.

export const MAX_PER_PAYMENT_NEAR = 10
export const MAX_ADDRESSES = 20
/** The design's "safe starting value" (L3.1). */
export const DEFAULT_PER_PAYMENT = "2"

const YOCTO = 10n ** 24n
const ACCOUNT_ID = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/

function toYocto(near: string): bigint {
  const [whole, frac = ""] = near.split(".")
  return BigInt(whole) * YOCTO + BigInt((frac + "0".repeat(24)).slice(0, 24))
}

/** What's wrong with the per-payment limit, or null when it's fine. */
export function perPaymentError(value: string): string | null {
  const v = value.trim()
  if (v === "") return "Enter how much one payment may be."
  if (!/^\d{1,3}(\.\d{1,24})?$/.test(v)) return "Use a number, like 2 or 0.5."
  const yocto = toYocto(v)
  if (yocto === 0n) return "Use more than 0 NEAR."
  if (yocto > BigInt(MAX_PER_PAYMENT_NEAR) * YOCTO) return `The most is ${MAX_PER_PAYMENT_NEAR} NEAR per payment.`
  return null
}

/** Accounts are compared and sent in lowercase, as NEAR account ids are. */
export function normalizeAccount(value: string): string {
  return value.trim().toLowerCase()
}

/** What's wrong with one address, or null when it's fine (empty rows are ignored). */
export function addressError(value: string, earlier: string[]): string | null {
  const v = normalizeAccount(value)
  if (v === "") return null
  const testnet = /^[0-9a-f]{64}$/.test(v) || (ACCOUNT_ID.test(v) && v.endsWith(".testnet"))
  if (!testnet) return "Use a testnet account, like shop.testnet."
  if (earlier.map(normalizeAccount).includes(v)) return "Already in the list."
  return null
}

export type LimitsCheck = {
  perPayment: string | null
  /** One entry per address row. */
  addresses: (string | null)[]
  /** The addresses to send: filled-in rows, lowercased. */
  whitelist: string[]
  /** The first thing to fix, for the line above Create; null when Create can go. */
  blocker: string | null
}

export function checkLimits(perPayment: string, rows: string[]): LimitsCheck {
  const perPaymentErr = perPaymentError(perPayment)
  const addresses = rows.map((row, i) => addressError(row, rows.slice(0, i)))
  const whitelist = rows.map(normalizeAccount).filter((v, i) => v !== "" && addresses[i] === null)
  const blocker = perPaymentErr
    ? "Fix the per payment limit first"
    : addresses.some(Boolean)
      ? "Fix the addresses first"
      : whitelist.length === 0
        ? "Add at least one address first"
        : null
  return { perPayment: perPaymentErr, addresses, whitelist, blocker }
}
