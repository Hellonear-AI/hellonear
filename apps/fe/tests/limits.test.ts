import { afterEach, describe, expect, it, vi } from "vitest"
import { walletApi } from "@/modules/wallet/api"
import { addressError, checkLimits, perPaymentError } from "@/modules/minds/data/limits"

afterEach(() => vi.unstubAllGlobals())

describe("per payment limit", () => {
  it.each(["2", "0.5", "10", "10.0", " 3 ", "0.000000000000000000000001"])("accepts %j", (v) => {
    expect(perPaymentError(v)).toBeNull()
  })
  it("says the most is 10 NEAR (L3.2)", () => {
    expect(perPaymentError("20")).toBe("The most is 10 NEAR per payment.")
    expect(perPaymentError("10.000000000000000000000001")).toBe("The most is 10 NEAR per payment.")
  })
  it.each(["", "0", "0.0", "abc", "1,5", "-1", "1e3"])("rejects %j", (v) => {
    expect(perPaymentError(v)).not.toBeNull()
  })
})

describe("addresses", () => {
  it.each(["shop.testnet", "Biznet-Home.testnet", "a_b.c.testnet", "0".repeat(64)])("accepts %j", (v) => {
    expect(addressError(v, [])).toBeNull()
  })
  it.each(["shop.near", "shop", "-shop.testnet", "shop..testnet", "x.testnet ".repeat(8)])("rejects %j", (v) => {
    expect(addressError(v, [])).toBe("Use a testnet account, like shop.testnet.")
  })
  it("flags duplicates, ignoring case", () => {
    expect(addressError("Shop.testnet", ["shop.testnet"])).toBe("Already in the list.")
  })
  it("ignores empty rows", () => {
    expect(addressError("  ", [])).toBeNull()
  })
})

describe("checkLimits", () => {
  it("sends filled-in rows in lowercase and lets Create go", () => {
    const c = checkLimits("2", ["Shop.testnet", "", "rent.testnet"])
    expect(c.whitelist).toEqual(["shop.testnet", "rent.testnet"])
    expect(c.blocker).toBeNull()
  })
  it("names the first thing to fix", () => {
    expect(checkLimits("20", ["shop.testnet"]).blocker).toBe("Fix the per payment limit first")
    expect(checkLimits("2", ["shop"]).blocker).toBe("Fix the addresses first")
    expect(checkLimits("2", [""]).blocker).toBe("Add at least one address first")
  })
})

describe("mindsApi wallet set-up", () => {
  it("treats an existing wallet (409 wallet_exists) as created", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "wallet_exists" }, { status: 409 })))
    await expect(walletApi.createWallet("m1")).resolves.toBeUndefined()
  })
  it("still throws other wallet errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "outlayer_error" }, { status: 502 })))
    await expect(walletApi.createWallet("m1")).rejects.toMatchObject({ code: "outlayer_error" })
  })
  it("posts the limits and returns the transaction to sign", async () => {
    const transaction = { receiverId: "outlayer.testnet", actions: [] }
    const fetchMock = vi.fn(async () => Response.json({ transaction }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(walletApi.policyTransaction("m1", { perTransactionNear: "2", whitelist: ["shop.testnet"] })).resolves.toEqual(transaction)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/v1/minds/m1/wallet/policy")
    expect(JSON.parse(init.body as string)).toEqual({ perTransactionNear: "2", whitelist: ["shop.testnet"] })
  })
})
