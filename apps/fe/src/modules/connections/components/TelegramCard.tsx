"use client"

import { CheckIcon, ExternalLinkIcon, SendIcon } from "lucide-react"
import { useState } from "react"
import { ErrorRetry } from "@/components/elements/ErrorRetry"
import { Spinner } from "@/components/elements/Spinner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { BOTFATHER_STEPS, isTelegramToken, telegramError } from "@/modules/connections/data/telegram"
import { useConnectTelegram, useDisconnectTelegram, useTelegram } from "@/modules/connections/hooks/useTelegram"

/**
 * Telegram (#168, #172): the owner talks to this Mind through a bot of their own. Get a token from
 * @BotFather, paste it, then open the one-time link so the bot answers only that Telegram account.
 * Payments and other approvals still happen in the app; the bot sends a link when one waits.
 * Started from Axel's draft (`feat/fe-telegram-card-draft`).
 */
export function TelegramCard({ mindId, name }: { mindId: string; name: string }) {
  const telegram = useTelegram(mindId)
  const connect = useConnectTelegram(mindId)
  const disconnect = useDisconnectTelegram(mindId)
  const [token, setToken] = useState("")
  const [replacing, setReplacing] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const t = telegram.data
  const typed = token.trim().length > 0
  const valid = isTelegramToken(token)

  const form = (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        connect.mutate(token.trim(), {
          onSuccess: () => {
            setToken("")
            setReplacing(false)
          },
        })
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
      </label>
      {typed && !valid && <p className="text-[13px] text-danger">This is not a bot token. A token looks like 123456789:ABC...</p>}
      {connect.error && <p className="text-[13px] text-danger">{telegramError(connect.error)}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!valid || connect.isPending}>
          {connect.isPending ? <Spinner /> : <SendIcon />}
          {connect.isPending ? "Checking the token" : "Connect bot"}
        </Button>
        {replacing && (
          <Button type="button" variant="outline" size="sm" onClick={() => setReplacing(false)}>
            Cancel
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">The token is kept on the server and never shown again. {name} never sees it.</p>
    </form>
  )

  return (
    <section aria-labelledby="telegram" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="telegram" className="text-[15px] font-semibold text-foreground">
          Telegram
        </h2>
        {t?.connected &&
          (t.linked ? (
            <Badge variant="success">
              <CheckIcon />
              Linked
            </Badge>
          ) : (
            <Badge variant="warning">One step left</Badge>
          ))}
      </div>
      <p className="text-[13px] text-muted-foreground">
        Talk to {name} from Telegram through a bot of your own. It answers only you, and payments still wait for your approval here.
      </p>
      {telegram.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : telegram.isError ? (
        <ErrorRetry small message="Could not check Telegram. Please try again later." onRetry={() => void telegram.refetch()} />
      ) : !t?.connected || replacing ? (
        form
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">
            Bot <span className="font-semibold">@{t.botUsername}</span>
            {t.linked ? (
              <>
                {" "}
                answers {t.ownerName ? <span className="font-semibold">{t.ownerName}</span> : "you"}. Write to it in Telegram.
              </>
            ) : (
              " is connected."
            )}
          </p>
          {!t.linked && t.linkUrl && (
            <div className="flex flex-col gap-2 rounded-md bg-muted px-4 py-3">
              <p className="text-[13px] text-foreground">
                Last step: open this link in Telegram and press Start. The Telegram account that does it becomes the only one the bot answers.
              </p>
              <Button size="sm" className="w-fit" nativeButton={false} render={<a href={t.linkUrl} target="_blank" rel="noreferrer" />}>
                <ExternalLinkIcon />
                Open @{t.botUsername} in Telegram
              </Button>
              <p className="text-xs text-muted-foreground">This page updates by itself once you have.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
              Use another bot
            </Button>
            <Button variant="outline" size="sm" className="text-danger" onClick={() => setConfirmOff(true)}>
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {/* Disconnect asks first, like the apps above (K2.3). */}
      <Dialog open={confirmOff} onOpenChange={(open) => !disconnect.isPending && setConfirmOff(open)}>
        <DialogContent showCloseButton={!disconnect.isPending}>
          <DialogHeader>
            <DialogTitle>Disconnect @{t?.connected ? t.botUsername : "the bot"}?</DialogTitle>
            <DialogDescription>
              {name} stops answering in Telegram. The bot itself stays in your Telegram; delete it with @BotFather if you no longer want it.
            </DialogDescription>
          </DialogHeader>
          {disconnect.error && <p className="text-[13px] text-danger">Could not disconnect. No changes were made. Please try again later.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOff(false)} disabled={disconnect.isPending}>
              Keep it
            </Button>
            <Button variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate(undefined, { onSuccess: () => setConfirmOff(false) })}>
              {disconnect.isPending && <Spinner />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
