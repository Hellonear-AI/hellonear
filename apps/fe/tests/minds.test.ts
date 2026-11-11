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
