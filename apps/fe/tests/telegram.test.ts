import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api"
import { isTelegramToken, telegramError } from "@/modules/connections/data/telegram"

describe("Telegram card (#168, #172)", () => {
  it("accepts BotFather's token format only", () => {
    expect(isTelegramToken("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")).toBe(true)
    expect(isTelegramToken("  123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw  ")).toBe(true)
    expect(isTelegramToken("my bot token")).toBe(false)
    expect(isTelegramToken("123456789:short")).toBe(false)
  })
  it("says what a failed connect means, formally", () => {
    const err = (code: string, status = 400) => new ApiError(status, code, {})
    expect(telegramError(err("invalid_telegram_token"))).toBe("Telegram did not accept this token. Copy it again from @BotFather.")
    expect(telegramError(err("telegram_bot_in_use", 409))).toMatch(/another Mind/)
    expect(telegramError(err("telegram_unreachable", 503))).toMatch(/^Could not reach Telegram/)
    expect(telegramError(new Error("boom"))).toMatch(/No changes were made/)
  })
})
