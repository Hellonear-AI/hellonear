import { describe, expect, it } from "vitest"
import { formatNear, shortWhen } from "@/lib/format"

describe("shortWhen", () => {
  const now = new Date(2026, 10, 8, 15, 0) // Sun 8 Nov 2026, 15:00 local

  it("says Today and Yesterday by calendar day, not by 24 hours", () => {
    expect(shortWhen(new Date(2026, 10, 8, 0, 5).toISOString(), now)).toBe("Today")
    expect(shortWhen(new Date(2026, 10, 7, 23, 59).toISOString(), now)).toBe("Yesterday")
  })

  it("uses a weekday within the last week, then a date", () => {
    expect(shortWhen(new Date(2026, 10, 2, 9, 0).toISOString(), now)).toBe("Mon")
    expect(shortWhen(new Date(2026, 9, 30, 9, 0).toISOString(), now)).toBe("30 Oct")
  })

  it("treats a time slightly in the future (clock skew) as Today, and bad input as empty", () => {
    expect(shortWhen(new Date(2026, 10, 8, 15, 1).toISOString(), now)).toBe("Today")
    expect(shortWhen("not a date", now)).toBe("")
  })
})

describe("formatNear", () => {
  it("shows two decimals, rounded down", () => {
    expect(formatNear("0.979910726975")).toBe("0.97")
    expect(formatNear("42")).toBe("42.00")
    expect(formatNear("1234.5")).toBe("1,234.50")
    expect(formatNear("0.009")).toBe("0.00")
  })

  it("leaves anything that isn't a plain decimal unchanged", () => {
    expect(formatNear("-1")).toBe("-1")
  })
})
