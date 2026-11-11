import { afterEach, describe, expect, it, vi } from "vitest"
import { walletApi } from "@/modules/wallet/api"

afterEach(() => vi.unstubAllGlobals())

describe("walletApi.wallet", () => {
  it("returns null when the Mind has no wallet yet (404 no_wallet)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "no_wallet" }, { status: 404 })))
    await expect(walletApi.wallet("m1")).resolves.toBeNull()
  })

  it("still throws other errors (e.g. 502 outlayer_error)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "outlayer_error" }, { status: 502 })))
    await expect(walletApi.wallet("m1")).rejects.toMatchObject({ status: 502, code: "outlayer_error" })
  })
})

describe("chat titles (#207)", () => {
  it("trims, joins spaces and keeps 1 to 60 characters", async () => {
    const { cleanTitle } = await import("@/modules/minds/hooks/useThreadActions")
    expect(cleanTitle("  Rent   for  March ")).toBe("Rent for March")
    expect(cleanTitle("   ")).toBeNull()
    expect(cleanTitle("x".repeat(61))).toBeNull()
    expect(cleanTitle("x".repeat(60))).toHaveLength(60)
  })
})
