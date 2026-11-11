import { describe, expect, it } from "vitest"

describe("skill names the model passes (#227 review)", () => {
  it("reads Mastra's path as the skill id", async () => {
    const { skillIdOf } = await import("@/modules/runs/data/steps")
    expect(skillIdOf("inline/best-price/SKILL.md")).toBe("best-price")
    expect(skillIdOf("best-price")).toBe("best-price")
    expect(skillIdOf("")).toBeNull()
  })
})
