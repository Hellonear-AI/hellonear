import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api"
import { failureText } from "@/modules/chat/components/ChatScreen"
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
