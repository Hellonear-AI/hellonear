import { isApiCode } from "@/lib/api"

// Telegram (#168, #172): the owner talks to a Mind through a bot of their own, made with @BotFather.

/** BotFather's token format (digits, a colon, then 30 to 64 letters, digits, _ or -); the backend checks it again. */
export const TELEGRAM_TOKEN = /^\d{5,16}:[A-Za-z0-9_-]{30,64}$/

export const isTelegramToken = (value: string) => TELEGRAM_TOKEN.test(value.trim())

/** What a failed connect means (docs/api-contract.md, Telegram), formal and plain. */
export function telegramError(err: unknown): string {
  if (isApiCode(err, "invalid_telegram_token")) return "Telegram did not accept this token. Copy it again from @BotFather."
  if (isApiCode(err, "telegram_bot_in_use")) return "This bot already works for another Mind. Make a new bot for this one."
  if (isApiCode(err, "invalid_body")) return "This is not a bot token. A token looks like 123456789:ABC..."
  return "Could not reach Telegram. No changes were made. Please try again later."
}

/** How to get a token from @BotFather, the steps Telegram's own guide gives for /newbot. */
export const BOTFATHER_STEPS = [
  { lead: "Open Telegram and find @BotFather", rest: " (the one with the blue check), then press Start." },
  { lead: "Send /newbot.", rest: " Give the bot a name, then a username that ends in bot, like my_mind_bot." },
  { lead: "Copy the token", rest: " BotFather sends (it looks like 123456789:ABC...) and paste it below. Keep it private: anyone with it can run your bot." },
] as const
