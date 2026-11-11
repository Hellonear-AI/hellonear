import { describe, expect, it } from "vitest"
import { SETTINGS_TABS, settingsTabOf } from "@/modules/settings/components/SettingsScreen"

describe("settings tabs", () => {
  it("are General, Memory and Approvals, read from the URL with General as the fallback", () => {
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual(["general", "memory", "approvals"])
    expect(settingsTabOf("memory")).toBe("memory")
    expect(settingsTabOf("approvals")).toBe("approvals")
    expect(settingsTabOf(null)).toBe("general")
    expect(settingsTabOf("billing")).toBe("general")
  })
})
