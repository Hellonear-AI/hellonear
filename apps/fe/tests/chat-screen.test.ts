import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api"
import { dayLabel, failureText } from "@/modules/chat/components/ChatScreen"
import { refusalReasons } from "@/modules/chat/components/RunCards"

describe("refusalReasons", () => {
  const policy = { perTransactionNear: "2", whitelist: ["shop.testnet"], transactionTypes: ["transfer"], boundToThisWallet: true }
  it("names the limits a payment broke (C1.4)", () => {
    expect(refusalReasons({ to: "refund-desk.testnet", amountNear: "25" }, policy)).toEqual(["Not on your list of addresses", "Over 2 NEAR per payment"])
    expect(refusalReasons({ to: "shop.testnet", amountNear: "2.000000000000000000000001" }, policy)).toEqual(["Over 2 NEAR per payment"])
    expect(refusalReasons({ to: "Shop.testnet", amountNear: "2" }, policy)).toEqual([])
  })
  it("says nothing it can't check", () => {
    expect(refusalReasons({ to: "x.testnet", amountNear: "5" }, null)).toEqual([])
  })
})

describe("failureText (C1.6)", () => {
  it("only says the message is saved when the run started", () => {
    expect(failureText("Penny", "engine_stream_interrupted")).toContain("Your message is saved")
    expect(failureText("Penny", new ApiError(503, "engine_error"))).not.toContain("saved")
    expect(failureText("Penny", new ApiError(429, "demo_run_limit"))).toContain("Connect a wallet")
  })
})

describe("dayLabel", () => {
  const now = new Date("2026-11-09T15:00:00")
  it("shows nothing for a chat from today", () => {
    expect(dayLabel("2026-11-09T10:00:00", null, now)).toBeNull()
    expect(dayLabel("2026-11-09T11:00:00", "2026-11-09T10:00:00", now)).toBeNull()
  })
  it("names the day at the top of an older thread and where the day changes", () => {
    expect(dayLabel("2026-11-08T10:00:00", null, now)).toBe("Yesterday")
    expect(dayLabel("2026-11-09T09:00:00", "2026-11-08T10:00:00", now)).toBe("Today")
  })
})

describe("no reply", () => {
  it("says the Mind didn't write one", () => {
    expect(failureText("Omaga", "no_reply")).toBe("Omaga thought about it but didn't write a reply. Try asking again.")
  })
})
