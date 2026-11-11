import { afterEach, describe, expect, it, vi } from "vitest"
import { memoryApi } from "@/modules/settings/api"
import { memorySections, updatedLine } from "@/modules/settings/data/memory"

afterEach(() => vi.unstubAllGlobals())

describe("memorySections (#209)", () => {
  it("groups the Mind's own Markdown by its headings, as plain rows", () => {
    const md = "# You\n- **Name**: Sam\n- Lives in *Jakarta*\n\n## Preferences\n* Short replies\n1. Pays on Fridays\n"
    expect(memorySections(md)).toEqual([
      { title: "You", rows: ["Name: Sam", "Lives in Jakarta"] },
      { title: "Preferences", rows: ["Short replies", "Pays on Fridays"] },
    ])
  })

  it("leaves out blank template fields and headings with nothing under them", () => {
    const md = "# User Information\n- **First Name**: Sam\n- **Last Name**: \n- **Location**:\n# Projects\n"
    expect(memorySections(md)).toEqual([{ title: "User Information", rows: ["First Name: Sam"] }])
  })

  it("keeps lines before the first heading, and reads an empty document as nothing", () => {
    expect(memorySections("Owner likes tea.\n# Later\n- x")).toEqual([
      { title: null, rows: ["Owner likes tea."] },
      { title: "Later", rows: ["x"] },
    ])
    expect(memorySections("")).toEqual([])
    expect(memorySections("\n\n---\n")).toEqual([])
  })

  it("reads links and code as their text", () => {
    expect(memorySections("- Site: [blog](https://x.example)\n- Id: `abc`")[0].rows).toEqual(["Site: blog", "Id: abc"])
  })
})

describe("updatedLine", () => {
  const now = new Date(2026, 10, 11, 12)
  it("says when the whole document last changed", () => {
    expect(updatedLine(new Date(2026, 10, 11, 8).toISOString(), now)).toBe("Updated today")
    expect(updatedLine(new Date(2026, 10, 10, 23).toISOString(), now)).toBe("Updated yesterday")
    expect(updatedLine(new Date(2026, 10, 8).toISOString(), now)).toBe("Updated 3 days ago")
    expect(updatedLine(new Date(2026, 10, 1).toISOString(), now)).toBe("Updated 1 Nov")
    expect(updatedLine("nope", now)).toBe("")
  })
})

describe("memoryApi", () => {
  it("reads, replaces and clears the Mind's memory route", async () => {
    const calls: { url: string; method: string; body?: string }[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, method: init.method ?? "GET", body: init.body as string | undefined })
        if (init.method === "DELETE") return new Response(null, { status: 204 })
        return Response.json({ memory: { markdown: "# You", updatedAt: null } })
      })
    )
    await expect(memoryApi.get("m1")).resolves.toEqual({ markdown: "# You", updatedAt: null })
    await memoryApi.replace("m1", "# You")
    await expect(memoryApi.clear("m1")).resolves.toBeUndefined()
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", "/api/v1/minds/m1/memory"],
      ["PUT", "/api/v1/minds/m1/memory"],
      ["DELETE", "/api/v1/minds/m1/memory"],
    ])
    expect(JSON.parse(calls[1].body!)).toEqual({ markdown: "# You" })
  })

  it("passes the try-out refusal through as its code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "demo_not_allowed", action: "edit_memory" }, { status: 403 })))
    await expect(memoryApi.clear("m1")).rejects.toMatchObject({ status: 403, code: "demo_not_allowed" })
  })
})
