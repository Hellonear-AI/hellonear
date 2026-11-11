// The plain checks on an approval card (design A1): read the payment against the wallet's stored
// policy and balance before the owner answers. They mirror what OutLayer enforces in its TEE;
// they don't replace it, they say in advance what it will do.

import { formatNear } from "@/lib/format"
import { compareNear } from "@/lib/near"
import type { ApiWallet } from "@/modules/wallet/api"

export type Check = { ok: boolean; text: string }

/** What the main button does: approve, or fix the limit that would block it first. */
export type NextStep = "approve" | "add_address" | "change_limits" | "unfreeze" | "fund"

export type ApprovalChecks = { checks: Check[]; next: NextStep }

export function approvalChecks(payment: { to: string; amountNear: string }, wallet: ApiWallet | null): ApprovalChecks {
  const checks: Check[] = []
  let next: NextStep = "approve"
  if (!wallet) return { checks, next }

  if (wallet.frozen) {
    checks.push({ ok: false, text: "Wallet frozen: blocked until you unfreeze it" })
    next = "unfreeze"
  }

  const limit = wallet.policy?.perTransactionNear
  if (limit) {
    const over = compareNear(payment.amountNear, limit) === 1
    checks.push(over ? { ok: false, text: `Over your ${limit} NEAR limit: blocked even if you approve` } : { ok: true, text: `Within your ${limit} NEAR limit` })
    if (over && next === "approve") next = "change_limits"
  }

  const list = wallet.policy?.whitelist
  if (list) {
    const listed = list.includes(payment.to.toLowerCase())
    checks.push(listed ? { ok: true, text: "On your list of addresses" } : { ok: false, text: "Not on your list: blocked even if you approve" })
    if (!listed && next === "approve") next = "add_address"
  }

  const enough = compareNear(wallet.balanceNear, payment.amountNear)
  if (enough !== null) {
    const balance = formatNear(wallet.balanceNear)
    checks.push(enough >= 0 ? { ok: true, text: `Enough balance: ${balance} NEAR` } : { ok: false, text: `Not enough balance: ${balance} NEAR` })
    // Approving can't go through: offer Add funds instead (#228, as apps/be/src/approvals.ts and
    // Telegram do). An unfunded wallet reads as balance "0", so it counts as not enough.
    if (enough < 0 && next === "approve") next = "fund"
  }

  return { checks, next }
}

/** Which of the owner's limits a refused payment broke, read against the wallet's stored policy. */
/** The reason a payment to an address off the list was refused (the receipt offers to add it). */
export const NOT_LISTED = "Not on your list of addresses"

export function refusalReasons(payment: { to: string; amountNear: string }, policy: ApiWallet["policy"]): string[] {
  const reasons: string[] = []
  if (policy?.whitelist && !policy.whitelist.includes(payment.to.toLowerCase())) reasons.push(NOT_LISTED)
  if (policy?.perTransactionNear && compareNear(payment.amountNear, policy.perTransactionNear) === 1) {
    reasons.push(`Over ${policy.perTransactionNear} NEAR per payment`)
  }
  return reasons
}
