import { describe, expect, it } from "vitest"
import type { ApiPayment, ApiWallet } from "@/modules/wallet/api"
import { spentToday, subNear, utcMidnightLocal } from "@/modules/wallet/data/activity"
import { approvalChecks } from "@/modules/wallet/data/checks"
import { dailyError } from "@/modules/minds/data/limits"
import { sameLimits } from "@/modules/wallet/hooks/useWalletActions"

const policy = { perTransactionNear: "1", dailyNear: "2", whitelist: ["a.testnet"], transactionTypes: ["transfer"], boundToThisWallet: true }
const wallet = (spentTodayNear?: string): ApiWallet => ({ address: "abc", shared: false, balanceNear: "10", frozen: false, policy, ...(spentTodayNear !== undefined ? { spentTodayNear } : {}) })
const pay = (amountNear: string, at: string): ApiPayment => ({ paymentId: at, to: "a.testnet", amountNear, status: "sent", at })

describe("daily cap (#149)", () => {
  it("the approval card checks what OutLayer counted today plus this payment", () => {
    expect(approvalChecks({ to: "a.testnet", amountNear: "0.5" }, wallet("1")).checks.find((c) => c.text.includes("today"))).toEqual({ ok: true, text: "Within today's 2 NEAR limit" })
    const over = approvalChecks({ to: "a.testnet", amountNear: "0.6" }, wallet("1.5"))
    expect(over.checks.find((c) => c.text.includes("today"))).toMatchObject({ ok: false })
    expect(over.checks.find((c) => c.text.includes("today"))!.text).toContain("0.50 left")
    expect(over.next).toBe("change_limits")
    // Exactly at the cap is allowed: OutLayer refuses spent + amount > cap.
    expect(approvalChecks({ to: "a.testnet", amountNear: "0.5" }, wallet("1.5")).next).toBe("approve")
    // An older backend sends no counter: no daily line rather than a guess.
    expect(approvalChecks({ to: "a.testnet", amountNear: "0.5" }, wallet()).checks.some((c) => c.text.includes("today"))).toBe(false)
  })

  it("spent today counts from 00:00 UTC, the day the cap uses", () => {
    const now = new Date("2026-11-11T03:00:00Z") // 10:00 in Jakarta
    const list = [pay("0.3", "2026-11-11T00:30:00Z"), pay("0.2", "2026-11-10T23:30:00Z")]
    expect(spentToday(list, now)).toEqual({ total: "0.3", count: 1 })
    expect(utcMidnightLocal(now, "Asia/Jakarta")).toBe("07:00")
    expect(utcMidnightLocal(now, "UTC")).toBe("00:00")
  })

  it("checks the daily limit like the backend", () => {
    expect(dailyError("", "1")).toBeNull()
    expect(dailyError("5", "1")).toBeNull()
    expect(dailyError("0.5", "1")).toBe("Use at least the per payment limit.")
    expect(dailyError("0", "1")).toMatch(/more than 0/)
    expect(dailyError("101", "1")).toMatch(/100 NEAR/)
    expect(dailyError("abc", "1")).toMatch(/number/)
  })

  it("saving compares the daily cap too, so a removed cap is waited for", () => {
    expect(sameLimits(policy, { perTransactionNear: "1", dailyNear: "2", whitelist: ["a.testnet"] })).toBe(true)
    expect(sameLimits(policy, { perTransactionNear: "1", dailyNear: null, whitelist: ["a.testnet"] })).toBe(false)
    expect(sameLimits({ ...policy, dailyNear: null }, { perTransactionNear: "1", dailyNear: null, whitelist: ["a.testnet"] })).toBe(true)
    expect(subNear("2", "1.5")).toBe("0.5")
    expect(subNear("1", "2")).toBe("0")
  })
})
