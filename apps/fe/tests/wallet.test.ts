import { afterEach, describe, expect, it, vi } from "vitest"
import { fromYocto, toYocto } from "@/lib/near"
import type { ApiPayment } from "@/modules/minds/api"
import { ownerAvailableNear } from "@/modules/wallet/api"
import { activityLine, addNear, filterActivity, spentToday } from "@/modules/wallet/data/activity"
import { shortAddress } from "@/modules/wallet/data/address"
import { walletActionText } from "@/modules/wallet/data/errors"
import { sameLimits, WalletActionError } from "@/modules/wallet/hooks/useWalletActions"

afterEach(() => vi.unstubAllGlobals())

const pay = (status: ApiPayment["status"], amountNear: string, at: string, to = "shop.testnet"): ApiPayment => ({ paymentId: `${status}${at}`, to, amountNear, status, at })

describe("yocto", () => {
  it("converts exactly both ways", () => {
    expect(toYocto("1.5")).toBe("1500000000000000000000000")
    expect(toYocto("0.000000000000000000000001")).toBe("1")
    expect(toYocto("1,5")).toBeNull()
    expect(fromYocto("1500000000000000000000000")).toBe("1.5")
    expect(fromYocto("1")).toBe("0.000000000000000000000001")
  })
})

describe("activity (W1)", () => {
  const now = new Date("2026-11-09T15:00:00")
  it("reads each payment plainly, with no dot separators", () => {
    const sent = activityLine(pay("sent", "1.5", "2026-11-09T10:42:00"), now)
    expect(sent).toMatchObject({ title: "Paid shop.testnet", amount: "−1.50 NEAR", badge: "Sent" })
    expect(sent.note.startsWith("Today, ")).toBe(true)
    const blocked = activityLine(pay("policy_denied", "25", "2026-11-08T10:00:00", "x.testnet"), now)
    expect(blocked).toMatchObject({ title: "Tried 25.00 NEAR to x.testnet", badge: "Blocked" })
    expect(blocked.note).toContain("your limits stopped it")
    for (const l of [sent, blocked]) expect(JSON.stringify(l)).not.toContain("·")
  })
  it("filters and sums what was sent today", () => {
    const list = [pay("sent", "1.5", "2026-11-09T10:00:00"), pay("sent", "2", "2026-11-09T11:00:00"), pay("sent", "9", "2026-11-08T11:00:00"), pay("policy_denied", "25", "2026-11-09T12:00:00")]
    expect(filterActivity(list, "blocked")).toHaveLength(1)
    expect(filterActivity(list, "sent")).toHaveLength(3)
    expect(spentToday(list, now)).toEqual({ total: "3.5", count: 2 })
    expect(addNear(["0.1", "0.2"])).toBe("0.3")
  })
})

describe("wallet helpers", () => {
  it("shortens implicit addresses only", () => {
    expect(shortAddress("0e50ce5f5bd37d91a022b0ed1496c517e04e989f93f7e6391018b0c5427b4f38")).toBe("0e50ce5f…7b4f38")
    expect(shortAddress("omaga.testnet")).toBe("omaga.testnet")
  })
  it("knows when the saved limits match what was asked", () => {
    const policy = { perTransactionNear: "3.0", whitelist: ["b.testnet", "a.testnet"], transactionTypes: ["transfer"], boundToThisWallet: true }
    expect(sameLimits(policy, { perTransactionNear: "3", whitelist: ["a.testnet", "b.testnet"] })).toBe(true)
    expect(sameLimits(policy, { perTransactionNear: "2", whitelist: ["a.testnet", "b.testnet"] })).toBe(false)
    expect(sameLimits(null, { perTransactionNear: "2", whitelist: [] })).toBe(false)
  })
  it("says what changed when an owner action fails", () => {
    expect(walletActionText(new WalletActionError("sign", new Error("rejected")), "limits")).toBe("Meteor didn't sign, so the limits weren't saved.")
    expect(walletActionText(new WalletActionError("sign", new Error("rejected")), "funds")).toBe("Meteor didn't sign, so nothing was sent.")
  })
  it("reads what the owner can send: balance minus storage over the free 770 bytes", async () => {
    const rpc = (amount: string, storage_usage: number) => vi.fn(async () => Response.json({ result: { amount, storage_usage } }))
    vi.stubGlobal("fetch", rpc("5000000000000000000000000", 500))
    await expect(ownerAvailableNear("me.testnet")).resolves.toBe("5")
    vi.stubGlobal("fetch", rpc("5000000000000000000000000", 1000))
    await expect(ownerAvailableNear("me.testnet")).resolves.toBe("4.99")
  })
})
