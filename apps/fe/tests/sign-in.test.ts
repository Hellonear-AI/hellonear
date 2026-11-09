import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api"
import { authApi } from "@/modules/auth/api"
import { demoError, walletError } from "@/modules/auth/components/SignInScreen"

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
    expect(demoError(new ApiError(404, "not_found"))).toContain("isn't available right now")
  })
})

describe("wallet sign-in errors (L1.3)", () => {
  it("says nothing changed when the wallet didn't sign", () => {
    expect(walletError(new Error("User rejected"))).toBe("Sign-in was canceled in the wallet. Nothing changed.")
    expect(walletError(new ApiError(401, "invalid_nonce"))).toContain("expired")
  })
})
