import { afterEach, describe, expect, it, vi } from "vitest"
import { mindsApi, type ApiTemplate } from "@/modules/minds/api"
import { isValidMindName, skillLabels, sortTemplates, suggestedName } from "@/modules/minds/data/templates"

afterEach(() => vi.unstubAllGlobals())

const template = (templateId: string, skillIds: string[] = []): ApiTemplate => ({
  templateId,
  name: templateId,
  tagline: "",
  quote: "",
  skills: skillIds.map((skillId) => ({ skillId, description: "", status: "available" })),
})

describe("Mind name rule (L2.3)", () => {
  it.each(["Penny", "Ava2", "  Iris  ", "Bü", "A".repeat(24)])("accepts %j", (name) => {
    expect(isValidMindName(name)).toBe(true)
  })
  it.each(["", "P", "A".repeat(25), "Mr Penny", "pen-ny", "Penny!"])("rejects %j", (name) => {
    expect(isValidMindName(name)).toBe(false)
  })
  it("suggests a valid name for each starter template", () => {
    for (const id of ["general-assistant", "payments-mind", "email-manager"]) expect(isValidMindName(suggestedName(id))).toBe(true)
    expect(suggestedName("unknown")).toBe("")
  })
})

describe("template cards", () => {
  it("follow the design order, unknown templates last", () => {
    const order = sortTemplates([template("email-manager"), template("new-one"), template("payments-mind"), template("general-assistant")])
    expect(order.map((t) => t.templateId)).toEqual(["general-assistant", "payments-mind", "email-manager", "new-one"])
  })
  it("show short labels and skip skills without one", () => {
    expect(skillLabels(template("payments-mind", ["payments", "daily-planner", "http-request"]))).toEqual(["Payments", "Plan your day"])
  })
})

describe("mindsApi.create", () => {
  it("posts the template and name", async () => {
    const fetchMock = vi.fn(async () => Response.json({ mind: { id: "m1", name: "Penny" } }, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(mindsApi.create({ templateId: "payments-mind", name: "Penny" })).resolves.toMatchObject({ id: "m1" })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/v1/minds")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ templateId: "payments-mind", name: "Penny" })
  })
})
