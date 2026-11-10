"use client"

import { CheckIcon, ExternalLinkIcon, Loader2Icon, SendIcon } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { useConnectTelegram, useDisconnectTelegram, useTelegram } from "@/modules/connections/hooks/useKeys"

/** BotFather's token format (digits, a colon, then 30+ letters, digits, _ or -), checked again by the backend. */
export const TELEGRAM_TOKEN = /^\d{5,16}:[A-Za-z0-9_-]{30,64}$/

/** What a failed connect means, in the owner's words. */
export function telegramError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : null
  if (code === "invalid_telegram_token") return "Telegram didn't accept this token. Copy it again from @BotFather."
  if (code === "telegram_bot_in_use") return "This bot already works for another Mind. Make a new bot for this one."
  if (code === "invalid_body") return "That doesn't look like a bot token. It looks like 123456789:ABC..."
  return "Could not reach Telegram. No changes were made. Please try again later."
}

// How to get a token from @BotFather (#168), the steps Telegram's own docs give for /newbot.
const STEPS = [
  <>Open Telegram and search for <b>@BotFather</b> (the one with the blue check), then press Start.</>,
  <>Send <b>/newbot</b>. Give the bot a name, then a username that ends in <b>bot</b>, like <b>my_mind_bot</b>.</>,
  <>BotFather answers with a token like <b>123456789:ABC...</b>. Copy it and paste it below. Keep it private: anyone with it can run your bot.</>,
]

/**
 * Telegram (#168): the owner talks to this Mind through their own bot. Paste the token from @BotFather, then open the
 * one-time link so the bot answers only you. Approvals still happen in the app.
 */
export function TelegramCard({ mindId, name }: { mindId: string; name: string }) {
  const telegram = useTelegram(mindId)
  const connect = useConnectTelegram(mindId)
  const disconnect = useDisconnectTelegram(mindId)
  const [token, setToken] = useState("")
  const [replacing, setReplacing] = useState(false)
  const t = telegram.data
  const valid = TELEGRAM_TOKEN.test(token.trim())

  const form = (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        connect.mutate(token.trim(), { onSuccess: () => { setToken(""); setReplacing(false) } })
      }}
    >
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-muted-foreground marker:text-foreground">
        {STEPS.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-foreground">Bot token</span>
        <Input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="123456789:ABC..."
          autoComplete="off"
          spellCheck={false}
          type="password"
          aria-invalid={token.trim().length > 0 && !valid}
        />
      </label>
      {token.trim().length > 0 && !valid && <p className="text-[13px] text-danger">That doesn&apos;t look like a bot token. It looks like 123456789:ABC...</p>}
      {connect.error && <p className="text-[13px] text-danger">{telegramError(connect.error)}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!valid || connect.isPending}>
          {connect.isPending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <SendIcon />}
          Connect bot
        </Button>
        {replacing && (
          <Button type="button" variant="outline" size="sm" onClick={() => setReplacing(false)}>
            Cancel
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">The token is kept encrypted and never shown again. {name} never sees it.</p>
    </form>
  )

  return (
    <section aria-labelledby="telegram" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="telegram" className="text-[15px] font-semibold text-foreground">
          Telegram
        </h2>
        {t?.connected && (t.linked ? (
          <Badge variant="success">
            <CheckIcon />
            Linked
          </Badge>
        ) : (
          <Badge variant="warning">Open the link to finish</Badge>
        ))}
      </div>
      <p className="text-[13px] text-muted-foreground">Talk to {name} from Telegram through a bot of your own. It answers only you, and payments still wait for your approval here.</p>
      {telegram.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : telegram.isError ? (
        <p className="text-[13px] text-muted-foreground">Could not check Telegram. Please try again later.</p>
      ) : !t?.connected || replacing ? (
        form
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">
            Bot <b>@{t.botUsername}</b>
            {t.linked ? <> answers {t.ownerName ? <b>{t.ownerName}</b> : "you"}. Write to it in Telegram.</> : "."}
          </p>
          {!t.linked && t.linkUrl && (
            <div className="flex flex-col gap-2 rounded-md bg-muted px-4 py-3">
              <p className="text-[13px] text-foreground">Last step: open this link in Telegram and press Start. The Telegram account that does it becomes the only one the bot answers.</p>
              <a href={t.linkUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-foreground underline underline-offset-2">
                <ExternalLinkIcon className="size-4" />
                Open @{t.botUsername} in Telegram
              </a>
              <p className="text-xs text-muted-foreground">This page updates by itself once you have.</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
              Use another bot
            </Button>
            <Button variant="outline" size="sm" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
              Disconnect
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
