import { describe, expect, it } from "vitest"
import { greetingFor, helloFor } from "@/modules/chat/data/intro"

describe("first chat greetings", () => {
  it("say hello by the owner's clock", () => {
    expect([helloFor(7), helloFor(13), helloFor(20), helloFor(2)]).toEqual(["Good morning", "Good afternoon", "Good evening", "Hello"])
  })
  it("pick from the Mind's own lines, the first being its plain hello", () => {
    expect(greetingFor("payments-mind", "Omaga", 0, 9)).toBe("Hi, I'm Omaga.")
    // Twelve lines each: pick i/12 lands on line i.
    expect(greetingFor("payments-mind", "Omaga", 1 / 12, 9)).toBe("Good morning. Any bills today?")
    expect(greetingFor("email-manager", "Kirim", 2 / 12, 9)).toBe("What's waiting in your inbox?")
    // The top of the range stays in the list and uses the Mind's name, not a fixed one.
    expect(greetingFor("payments-mind", "Meetcek", 0.9999, 20)).toBe("Meetcek at your service.")
    // An unknown template speaks like the General Assistant.
    expect(greetingFor("someone-new", "Ada", 2 / 12, 9)).toBe("Where should we start?")
  })
  it("never uses a dash or a middle dot (UI rules)", () => {
    for (const t of ["payments-mind", "email-manager", "general-assistant"])
      for (let i = 0; i < 12; i++) for (const h of [3, 9, 15, 21]) expect(greetingFor(t, "Omaga", i / 12, h)).not.toMatch(/[—–·]/)
  })
})
