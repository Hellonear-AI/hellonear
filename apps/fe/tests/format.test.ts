import { describe, expect, it } from "vitest"
import { formatNear, formatNearAmount, shortWhen } from "@/lib/format"

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

describe("formatNearAmount", () => {
  it("shows a small payment instead of 0.00, still rounded down", () => {
    expect(formatNearAmount("0.001")).toBe("0.001")
    expect(formatNearAmount("0.0006")).toBe("0.0006")
    expect(formatNearAmount("0.00012345")).toBe("0.0001")
    expect(formatNearAmount("0.012")).toBe("0.012")
    expect(formatNearAmount("1.5")).toBe("1.50")
    expect(formatNearAmount("0.01")).toBe("0.01")
    expect(formatNearAmount("1234.56789")).toBe("1,234.5678")
    expect(formatNearAmount("0")).toBe("0.00")
    expect(formatNearAmount("0.00001")).toBe("0.00")
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
