import { afterEach, describe, expect, it, vi } from "vitest"
import { mindsApi } from "@/modules/minds/api"
import { matchesSearch, SKILLS, skillCopy, skillLines } from "@/modules/skills/data/skills"
import { connectionStatus } from "@/modules/skills/hooks/useSkills"

afterEach(() => vi.unstubAllGlobals())

describe("skill words (S1)", () => {
  it("has the engine's five skills, in plain words, with no dot separators", () => {
    expect(Object.keys(SKILLS).sort()).toEqual(["daily-planner", "email-triage", "http-request", "near-account", "payments"])
    for (const id of Object.keys(SKILLS)) expect(JSON.stringify(skillCopy(id).blurb)).not.toContain("·")
  })
  it("puts the wallet limit into Payments when there is one", () => {
    expect(SKILLS.payments.canUse({ name: "Omaga", limit: "1" })[0]).toBe("Omaga's wallet, up to 1 NEAR per payment")
    expect(SKILLS.payments.canUse({ name: "Omaga", limit: null })[0]).toBe("Omaga's wallet, inside the limits you set")
  })
  it("only makes Email helper wait for an app", () => {
    expect(SKILLS["email-triage"].needs).toBe("gmail")
    expect(SKILLS["daily-planner"].needs).toBeUndefined()
  })
  it("gives an unknown skill a plain card", () => {
    expect(skillCopy("web-search").title).toBe("Web search")
  })
  it("searches what people read", () => {
    expect(matchesSearch("email-triage", "gmail")).toBe(false)
    expect(matchesSearch("email-triage", "draft")).toBe(true)
    expect(matchesSearch("payments", "")).toBe(true)
  })
})

describe("connections", () => {
  it("reads one app's status, not connected when missing", () => {
    expect(connectionStatus([{ toolkit: "gmail", status: "connected" }], "gmail")).toBe("connected")
    expect(connectionStatus([], "googlecalendar")).toBe("not_connected")
    expect(connectionStatus(undefined, "gmail")).toBe("not_connected")
  })
})

describe("mindsApi skills calls", () => {
  it("patches the whole skill list and posts a connect", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/connections/") ? Response.json({ redirectUrl: "https://connect.composio.dev/x" }) : Response.json({ mind: { id: "m1", skills: ["payments"] } })
    )
    vi.stubGlobal("fetch", fetchMock)
    await mindsApi.update("m1", { skills: ["payments"] })
    await expect(mindsApi.connect("gmail")).resolves.toBe("https://connect.composio.dev/x")
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe("/api/v1/minds/m1")
    expect(calls[0][1].method).toBe("PATCH")
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ skills: ["payments"] })
    expect(calls[1][0]).toBe("/api/v1/connections/gmail")
  })
})

describe("skillLines", () => {
  it("says whether an optional app is connected, not 'if you connect it'", () => {
    const off = skillLines("daily-planner", { name: "Omaga", limit: null, apps: {} })
    expect(off.at(-1)).toEqual({ t: "Your Google Calendar, not connected", tone: "off", connect: "googlecalendar" })
    const on = skillLines("daily-planner", { name: "Omaga", limit: null, apps: { googlecalendar: "connected" } })
    expect(on.at(-1)).toEqual({ t: "Your Google Calendar, connected", tone: "ok" })
  })
  it("keeps can't lines last", () => {
    expect(skillLines("near-account", { name: "Omaga", limit: null }).map((l) => l.tone)).toEqual(["ok", "no"])
  })
})
