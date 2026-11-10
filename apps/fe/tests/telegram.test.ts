import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api"
import { TELEGRAM_TOKEN, telegramError } from "@/modules/connections/components/TelegramCard"

describe("Telegram card (#168)", () => {
  it("accepts BotFather's token format only", () => {
    expect(TELEGRAM_TOKEN.test("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")).toBe(true)
    expect(TELEGRAM_TOKEN.test("my bot token")).toBe(false)
    expect(TELEGRAM_TOKEN.test("123456789:short")).toBe(false)
  })
  it("says what a failed connect means", () => {
    const err = (code: string, status = 400) => new ApiError(status, code, {})
    expect(telegramError(err("invalid_telegram_token"))).toMatch(/didn't accept this token/)
    expect(telegramError(err("telegram_bot_in_use", 409))).toMatch(/another Mind/)
    expect(telegramError(new Error("boom"))).toMatch(/Could not reach Telegram/)
  })
})
