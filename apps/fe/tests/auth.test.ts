import { afterEach, describe, expect, it, vi } from "vitest"
import { api, ApiError } from "@/lib/api"
import { authApi, nonceBytes } from "@/modules/auth/api"

afterEach(() => vi.unstubAllGlobals())

function stubFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn(async () =>
    body === undefined ? new Response(null, { status }) : Response.json(body, { status })
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("nonceBytes", () => {
  it("decodes the 32-byte base64 challenge nonce", () => {
    const raw = Uint8Array.from({ length: 32 }, (_, i) => i * 7)
    const b64 = Buffer.from(raw).toString("base64")
    expect(nonceBytes(b64)).toEqual(raw)
  })
})

describe("api", () => {
  it("calls our own origin with the session cookie and a JSON body", async () => {
    const fetchMock = stubFetch(200, { user: { id: "u1", nearAccountId: "a.testnet" } })
    await authApi.login({ accountId: "a.testnet", publicKey: "ed25519:x", signature: "s", nonce: "n" })
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "a.testnet", publicKey: "ed25519:x", signature: "s", nonce: "n" }),
    })
  })

  it("turns { error, ...details } into an ApiError", async () => {
    stubFetch(403, { error: "demo_not_allowed", action: "freeze" })
    const err = await api("/minds/m1/wallet/freeze", { method: "POST" }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 403, code: "demo_not_allowed", details: { action: "freeze" } })
  })

  it("returns undefined for 204 (logout)", async () => {
    stubFetch(204)
    await expect(authApi.logout()).resolves.toBeUndefined()
  })

  it("reports a non-JSON failure (proxy down) as request_failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Internal Server Error", { status: 500 })))
    await expect(authApi.me()).rejects.toMatchObject({ status: 500, code: "request_failed" })
  })
})
