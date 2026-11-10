import { afterEach, describe, expect, it, vi } from "vitest"
import { connectionsApi } from "@/modules/connections/api"
import { mindsApi } from "@/modules/minds/api"
import { matchesSearch, SKILLS, skillCopy, skillLines } from "@/modules/skills/data/skills"
import { connectionStatus } from "@/modules/connections/hooks/useConnections"

afterEach(() => vi.unstubAllGlobals())

describe("skill words (S1)", () => {
  it("has the engine's ten skills, in plain words, with no dot separators", () => {
    expect(Object.keys(SKILLS).sort()).toEqual([
      "daily-planner",
      "email-address",
      "email-triage",
      "http-request",
      "meeting-prep",
      "morning-briefing",
      "near-account",
      "paid-data",
      "payments",
      "subscriptions",
    ])
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
    await expect(connectionsApi.connect("gmail")).resolves.toBe("https://connect.composio.dev/x")
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
    expect(off).toContainEqual({ t: "Your Google Calendar, not connected", tone: "off", connect: "googlecalendar" })
    const on = skillLines("daily-planner", { name: "Omaga", limit: null, apps: { googlecalendar: "connected" } })
    expect(on).toContainEqual({ t: "Your Google Calendar, connected", tone: "ok" })
  })
  it("keeps can't lines last", () => {
    expect(skillLines("near-account", { name: "Omaga", limit: null }).map((l) => l.tone)).toEqual(["ok", "no"])
  })
})

describe("new skills (9 Nov)", () => {
  it("show every app they work with, connected or not", () => {
    const lines = skillLines("morning-briefing", { name: "Omaga", limit: null, apps: { gmail: "connected" } })
    expect(lines.filter((l) => l.connect).map((l) => l.t)).toEqual(["Your Google Calendar, not connected"])
    expect(lines.some((l) => l.t === "Your Gmail, connected")).toBe(true)
  })
  it("make Subscriptions wait for Gmail", () => {
    expect(SKILLS.subscriptions.needs).toBe("gmail")
  })
})

describe("try-out skill lines", () => {
  it("name the sample inbox and calendar, and never offer to connect", () => {
    const ctx = { name: "Mpruy", limit: "0.05", tryOut: true }
    expect(skillLines("email-triage", ctx)[0].t).toBe("A sample inbox for the try-out: read mail and save drafts")
    const briefing = skillLines("morning-briefing", ctx)
    expect(briefing.some((l) => l.connect)).toBe(false)
    expect(briefing.map((l) => l.t)).toContain("A sample calendar for the try-out")
  })
})
