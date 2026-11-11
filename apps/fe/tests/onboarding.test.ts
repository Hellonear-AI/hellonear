import { describe, expect, it } from "vitest"
import { gettingStartedSteps } from "@/modules/onboarding/components/GettingStarted"

const none = { tryOut: false, chatted: false, limits: false, funded: false, paid: false, live: false, connected: false, attacked: false }

describe("Getting started", () => {
  it("lists every step for an owner, in order, each checked from its own fact", () => {
    const steps = gettingStartedSteps("m", "Omaga", { ...none, chatted: true, paid: true })
    expect(steps.map((s) => s.id)).toEqual(["chat", "limits", "funds", "pay", "live", "app", "attack"])
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(["chat", "pay"])
    expect(steps[0].title).toBe("Say hi to Omaga")
    expect(steps.find((s) => s.id === "app")?.href).toBe("/minds/m/connections")
  })

  it("leaves out what a try-out can't do (limits, funds, apps)", () => {
    expect(gettingStartedSteps("m", "Omaga", { ...none, tryOut: true }).map((s) => s.id)).toEqual(["chat", "pay", "live", "attack"])
  })
})
