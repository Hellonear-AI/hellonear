import { describe, expect, it } from "vitest"
import { addNear, subNear } from "@/lib/near"
import { resetTime } from "@/lib/format"
import { checkLimits, perDayError } from "@/modules/minds/data/limits"
import type { ApiWallet } from "@/modules/wallet/api"
import { approvalChecks, refusalReasons } from "@/modules/wallet/data/checks"

const wallet = (over: Partial<ApiWallet> = {}, daily: string | null = "5"): ApiWallet => ({
  address: "a".repeat(64),
  shared: false,
  balanceNear: "42",
  spentTodayNear: "3",
  frozen: false,
  policy: { perTransactionNear: "2", dailyNear: daily, whitelist: ["shop.testnet"], transactionTypes: ["transfer"], boundToThisWallet: true },
  ...over,
})

describe("daily limit (#149)", () => {
  it("adds and subtracts NEAR exactly", () => {
    expect(addNear("0.1", "0.2")).toBe("0.3")
    expect(subNear("5", "3.25")).toBe("1.75")
    expect(subNear("1", "2")).toBe("0")
  })

  it("is optional, above 0, at most 100, and not below the per payment limit", () => {
    expect(perDayError("", "2")).toBeNull()
    expect(perDayError("5", "2")).toBeNull()
    expect(perDayError("0", "2")).toMatch(/more than 0/)
    expect(perDayError("101", "2")).toMatch(/100 NEAR a day/)
    expect(perDayError("1", "2")).toBe("Use at least the per payment limit, 2 NEAR.")
    expect(checkLimits("2", ["shop.testnet"], "1").blocker).toBe("Fix the daily limit first")
    expect(checkLimits("2", ["shop.testnet"]).blocker).toBeNull()
  })

  it("checks today's spend from OutLayer's counter; reaching the limit exactly goes through", () => {
    const fits = approvalChecks({ to: "shop.testnet", amountNear: "2" }, wallet())
    expect(fits.next).toBe("approve")
    expect(fits.checks).toContainEqual({ ok: true, text: "Within today's 5 NEAR limit (2.00 left)" })
    const over = approvalChecks({ to: "shop.testnet", amountNear: "2" }, wallet({ spentTodayNear: "3.5" }))
    expect(over.next).toBe("change_limits")
    expect(over.checks).toContainEqual({ ok: false, text: "Over today's 5 NEAR limit (1.50 left): blocked even if you approve" })
    // No counter yet reads as nothing spent; no daily limit adds no check.
    expect(approvalChecks({ to: "shop.testnet", amountNear: "2" }, wallet({ spentTodayNear: undefined })).next).toBe("approve")
    expect(approvalChecks({ to: "shop.testnet", amountNear: "2" }, wallet({}, null)).checks.some((c) => c.text.includes("today"))).toBe(false)
  })

  it("names the daily limit for a refusal nothing else explains", () => {
    expect(refusalReasons({ to: "shop.testnet", amountNear: "1" }, wallet().policy)).toEqual(["Over the 5 NEAR daily limit"])
    expect(refusalReasons({ to: "x.testnet", amountNear: "1" }, wallet().policy)).toHaveLength(1)
    expect(refusalReasons({ to: "shop.testnet", amountNear: "1" }, wallet({}, null).policy)).toEqual([])
  })

  it("starts over at 00:00 UTC, shown on the owner's clock", () => {
    expect(resetTime(new Date("2026-11-11T10:00:00Z"))).toMatch(/^\d{2}:\d{2}$/)
  })
})
