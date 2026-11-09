import { describe, expect, it } from "vitest"
import { introFor } from "@/modules/chat/data/intro"

// First-chat copy must not promise what the template's starter skills can't do (Nabil's review, #10, 9 Nov).
describe("first chat intros", () => {
  it("General Assistant starts with Daily planner only, so it offers no wallet or balance", () => {
    const { intro, suggestions } = introFor("general-assistant", null, null)
    expect(intro).not.toMatch(/wallet/i)
    expect(suggestions.join(" ")).not.toMatch(/balance/i)
    expect(suggestions).toContain("What's on my calendar this week?")
  })
  it("Email Manager never sends from the owner's Gmail, but doesn't claim it can never send", () => {
    const { intro } = introFor("email-manager", null, null)
    expect(intro).toContain("I never send from your Gmail")
    expect(intro).not.toContain("never send email myself")
  })
  it("Payments Mind names the limit when there is one", () => {
    expect(introFor("payments-mind", "0.1", null).intro).toContain("up to 0.1 NEAR at a time")
  })
})
