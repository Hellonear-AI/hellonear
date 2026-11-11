import { afterEach, describe, expect, it, vi } from "vitest"
import { connectionsApi } from "@/modules/connections/api"
import { keyNameError, keyValueError, parseHosts } from "@/modules/connections/data/keys"

afterEach(() => vi.unstubAllGlobals())

describe("key rules (same as apps/be/src/secrets.ts)", () => {
  it("names are capital letters, numbers and _, starting with a letter", () => {
    expect(keyNameError("SHOP_API_KEY", [])).toBeNull()
    expect(keyNameError("shop_key", [])).not.toBeNull()
    expect(keyNameError("1KEY", [])).not.toBeNull()
    expect(keyNameError("SHOP_API_KEY", ["SHOP_API_KEY"])).toContain("Replace it instead")
  })
  it("values are 4 to 8192 characters", () => {
    expect(keyValueError("abc")).not.toBeNull()
    expect(keyValueError("abcd")).toBeNull()
    expect(keyValueError("x".repeat(8193))).not.toBeNull()
  })
  it("sites are host names, one per line, lowercased and deduplicated", () => {
    expect(parseHosts("api.Example.com\napi.example.com\n\nshop.id")).toEqual({ hosts: ["api.example.com", "shop.id"], error: null })
    expect(parseHosts("https://api.example.com").error).toContain("without https://")
    expect(parseHosts("api.example.com/v1").error).toContain("without https://")
    expect(parseHosts("localhost").error).toContain("isn't a site name")
    expect(parseHosts(Array.from({ length: 11 }, (_, i) => `a${i}.com`).join("\n")).error).toBe("At most 10 sites per key.")
  })
})

describe("connectionsApi", () => {
  it("puts a key by name and never sends anything but the value and sites", async () => {
    const fetchMock = vi.fn(async () => Response.json({ secret: { name: "SHOP_API_KEY", allowedHosts: ["api.shop.com"], createdAt: "", updatedAt: "" } }))
    vi.stubGlobal("fetch", fetchMock)
    await connectionsApi.putSecret("SHOP_API_KEY", { value: "s3cret", allowedHosts: ["api.shop.com"] })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/v1/secrets/SHOP_API_KEY")
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toEqual({ value: "s3cret", allowedHosts: ["api.shop.com"] })
  })
})
