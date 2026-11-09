import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api"
import { authApi } from "@/modules/auth/api"
import { demoError, walletError } from "@/modules/auth/components/SignInScreen"
import { lockedReason, type LockedAction } from "@/modules/auth/components/TryOutLockedDialog"

afterEach(() => vi.unstubAllGlobals())

describe("try-out sign-in (T1.1)", () => {
  it("posts to /auth/demo and returns the try-out user", async () => {
    const fetchMock = vi.fn(async () => Response.json({ user: { id: "u1", nearAccountId: "demo:abc", demo: true } }, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(authApi.demo()).resolves.toEqual({ user: { id: "u1", nearAccountId: "demo:abc", demo: true } })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/v1/auth/demo")
    expect(init.method).toBe("POST")
  })
  it("says what happened when a try-out can't start (T1.2)", () => {
    expect(demoError(new ApiError(429, "demo_rate_limited"))).toContain("Too many try-outs from this network")
    expect(demoError(new ApiError(404, "not_found"))).toContain("not available at the moment")
  })
})

describe("wallet sign-in errors (L1.3)", () => {
  it("says the sign-in was canceled when the wallet didn't sign", () => {
    expect(walletError(new Error("User rejected"))).toBe("Sign-in was canceled in the wallet.")
    expect(walletError(new ApiError(401, "invalid_nonce"))).toContain("expired")
  })
})

describe("try-out owner actions (T1.4)", () => {
  const actions: LockedAction[] = ["add-funds", "freeze", "limits", "wallet", "keys", "autopilot"]

  it("says why each action needs a wallet, in plain words", () => {
    for (const a of actions) {
      const text = lockedReason(a, "Penny")
      expect(text.length).toBeGreaterThan(20)
      expect(text).not.toMatch(/[—·]/) // no em dash, no "·" (UI rules)
    }
    expect(lockedReason("freeze", "Penny")).toBe(
      "Freezing needs the owner's signature. In try-out, Penny uses a shared test wallet that only HelloNear can change."
    )
    expect(lockedReason("keys", "Penny")).toContain("can't keep them")
  })
})

describe("Minds of a session that ended (Back after switching accounts)", () => {
  it("keeps the ids per tab, without repeats, and survives blocked storage", async () => {
    const store = new Map<string, string>()
    vi.stubGlobal("window", {
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    })
    const { leftMinds, rememberLeftMinds } = await import("@/modules/auth/data/leftMinds")
    expect(leftMinds()).toEqual([])
    rememberLeftMinds(["mnd_a", "mnd_b"])
    rememberLeftMinds(["mnd_b", "mnd_c"])
    expect(leftMinds()).toEqual(["mnd_a", "mnd_b", "mnd_c"])

    vi.stubGlobal("window", { sessionStorage: { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") } } })
    expect(leftMinds()).toEqual([])
    expect(() => rememberLeftMinds(["mnd_d"])).not.toThrow()
  })
})
