"use client"

import { CheckIcon, ExternalLinkIcon, SendIcon } from "lucide-react"
import { useState } from "react"
import { ResponsiveDialog } from "@/components/elements/ResponsiveDialog"
import { TelegramLogo } from "@/components/elements/AppLogos"
import { Spinner } from "@/components/elements/Spinner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ApiTelegram } from "@/modules/connections/api"
import { BOTFATHER_STEPS, isTelegramToken, telegramError } from "@/modules/connections/data/telegram"
import { useConnectTelegram, useDisconnectTelegram, useTelegram } from "@/modules/connections/hooks/useTelegram"

/**
 * Telegram (#168, #172) as one row in Apps, like Gmail and Calendar (Ancung, 11 Nov: a card of its
 * own with the whole guide was too much). Connecting happens in a dialog: the BotFather steps and
 * the token, then the one-time link, then "Linked". Payments and other approvals still happen in
 * the app; the bot sends a link when one waits. Started from Axel's draft.
 */
export function TelegramRow({ mindId, name }: { mindId: string; name: string }) {
  const telegram = useTelegram(mindId)
  const [open, setOpen] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const t = telegram.data
  const linked = Boolean(t?.connected && t.linked)
  const halfway = Boolean(t?.connected && !t.linked)

  return (
    <li className="flex flex-col gap-3 rounded-md bg-muted px-4 py-3 sm:flex-row sm:items-center">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface">
        <TelegramLogo />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Telegram</span>
          {telegram.isPending ? null : linked ? (
            <Badge variant="success">
              <CheckIcon />
              Connected
            </Badge>
          ) : halfway ? (
            <Badge variant="warning">One step left</Badge>
          ) : (
            <Badge variant="neutral">Not connected</Badge>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {telegram.isError
            ? "Could not check Telegram. Please try again later."
            : linked && t?.connected
              ? `Bot @${t.botUsername} answers ${t.ownerName ?? "you"} for ${name}. Approvals still happen here.`
              : halfway
                ? "Open the bot's link in Telegram to finish."
                : `Talk to ${name} from Telegram through a bot of your own. It answers only you.`}
        </p>
      </div>
      {!telegram.isPending && !telegram.isError && (
        <div className="flex flex-wrap gap-2">
          {linked ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                Change bot
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmOff(true)}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" className="w-fit" onClick={() => setOpen(true)}>
              <SendIcon />
              {halfway ? "Finish linking" : "Connect Telegram"}
            </Button>
          )}
        </div>
      )}
      {/* A fresh dialog per opening, so it starts from what is saved. */}
      {open && <ConnectTelegramDialog mindId={mindId} name={name} telegram={t} replace={linked} onClose={() => setOpen(false)} />}
      <DisconnectTelegramDialog mindId={mindId} name={name} bot={t?.connected ? t.botUsername : null} open={confirmOff} onOpenChange={setConfirmOff} />
    </li>
  )
}

/** Step 1 the token, step 2 the link; it reads the bot every 3 s (useTelegram) and says when it's linked. */
function ConnectTelegramDialog({
  mindId,
  name,
  telegram,
  replace,
  onClose,
}: {
  mindId: string
  name: string
  telegram: ApiTelegram | undefined
  /** Opened from "Change bot": start at the token even though a bot is linked. */
  replace: boolean
  onClose: () => void
}) {
  const connect = useConnectTelegram(mindId)
  const [token, setToken] = useState("")
  const [asking, setAsking] = useState(replace || !telegram?.connected)
  const typed = token.trim().length > 0
  const valid = isTelegramToken(token)
  const bot = telegram?.connected ? telegram : null
  const step = asking || !bot ? "token" : bot.linked ? "done" : "link"
  const close = (open: boolean) => !open && onClose()

  if (step === "token") {
    return (
      <ResponsiveDialog
        open
        onOpenChange={close}
        busy={connect.isPending}
        title={replace ? "Use another bot" : "Connect Telegram"}
        description={`Make a bot of your own with @BotFather, then paste its token. Only you will be able to talk to ${name} through it.`}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose} disabled={connect.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="telegram-token" disabled={!valid || connect.isPending}>
              {connect.isPending && <Spinner />}
              {connect.isPending ? "Checking the token" : "Connect bot"}
            </Button>
          </>
        }
      >
        <form
          id="telegram-token"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) connect.mutate(token.trim(), { onSuccess: () => setAsking(false) })
          }}
        >
          <ol className="flex flex-col gap-2.5">
            {BOTFATHER_STEPS.map((s, i) => (
              <li key={s.lead} className="flex gap-3 text-[13px] text-muted-foreground">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">{i + 1}</span>
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{s.lead}</span>
                  {s.rest}
                </span>
              </li>
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
              aria-invalid={typed && !valid}
            />
            <span className={typed && !valid ? "text-xs text-danger" : "text-xs text-muted-foreground"}>
              {typed && !valid ? "This is not a bot token. A token looks like 123456789:ABC..." : `Kept on the server and never shown again. ${name} never sees it.`}
            </span>
          </label>
          {connect.error && <p className="text-[13px] text-danger">{telegramError(connect.error)}</p>}
        </form>
      </ResponsiveDialog>
    )
  }

  if (step === "link" && bot) {
    return (
      <ResponsiveDialog
        open
        onOpenChange={close}
        title={`Open @${bot.botUsername} in Telegram`}
        description="Last step: open the bot from this link and press Start. The Telegram account that does it becomes the only one the bot answers."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Finish later
            </Button>
            <Button variant="outline" onClick={() => setAsking(true)}>
              Use another bot
            </Button>
          </>
        }
      >
        {bot.linkUrl && (
          <Button className="w-full" nativeButton={false} render={<a href={bot.linkUrl} target="_blank" rel="noreferrer" />}>
            <ExternalLinkIcon />
            Open @{bot.botUsername}
          </Button>
        )}
        <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground" role="status">
          <Spinner />
          Waiting for you to press Start in Telegram
        </p>
      </ResponsiveDialog>
    )
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={close}
      title="Telegram is connected"
      description={`@${bot?.botUsername} answers ${bot?.ownerName ?? "you"}. Write to it in Telegram to talk to ${name}. Payments and other approvals still happen here; the bot sends you a link when one waits.`}
      footer={<Button onClick={onClose}>Done</Button>}
    />
  )
}

/** Disconnect asks first, like the apps beside it (K2.3). */
function DisconnectTelegramDialog({
  mindId,
  name,
  bot,
  open,
  onOpenChange,
}: {
  mindId: string
  name: string
  bot: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const disconnect = useDisconnectTelegram(mindId)
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={disconnect.isPending}
      title={`Disconnect ${bot ? `@${bot}` : "Telegram"}?`}
      description={`${name} stops answering in Telegram. The bot itself stays in your Telegram; delete it with @BotFather if you no longer want it.`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={disconnect.isPending}>
            Keep it
          </Button>
          <Button variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
            {disconnect.isPending && <Spinner />}
            Disconnect
          </Button>
        </>
      }
    >
      {disconnect.error && <p className="text-[13px] text-danger">Could not disconnect. No changes were made. Please try again later.</p>}
    </ResponsiveDialog>
  )
}
