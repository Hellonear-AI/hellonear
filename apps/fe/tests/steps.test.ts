import { describe, expect, it } from "vitest"

describe("skill names the model passes (#227 review)", () => {
  it("reads Mastra's path as the skill id", async () => {
    const { skillIdOf } = await import("@/modules/runs/data/steps")
    expect(skillIdOf("inline/best-price/SKILL.md")).toBe("best-price")
    expect(skillIdOf("best-price")).toBe("best-price")
    expect(skillIdOf("")).toBeNull()
  })
})

describe("Google Sheets step rows say where (#249)", () => {
  it("name the cells changed or the row added, and how many rows were read", async () => {
    const { stepText } = await import("@/modules/runs/data/steps")
    const step = (tool: string, result: unknown) => ({ toolCallId: "t", tool, args: {}, status: "ok" as const, result }) as Parameters<typeof stepText>[0]
    expect(stepText(step("googlesheets_update_cells", { status: "updated", updatedRange: "Invoices!D3", updatedCells: 1 }))).toMatchObject({ label: "Changed cells in a spreadsheet", detail: "Invoices!D3" })
    expect(stepText(step("googlesheets_append_row", { status: "appended", updatedRange: "Costs!A12:C12", updatedCells: 3 })).detail).toBe("Costs!A12:C12")
    expect(stepText(step("googlesheets_read_range", { values: [["a"], ["b"]] })).detail).toBe("2 rows")
    expect(stepText(step("googlesheets_find_spreadsheets", { spreadsheets: [{ id: "1" }] })).detail).toBe("1 spreadsheet")
  })
})
