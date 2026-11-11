"use client"

import { CheckIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { cn } from "cn"
import { mindHref } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { compareNear } from "@/lib/near"
import { useIsTryOut } from "@/modules/auth/hooks/useSession"
import { useConnections } from "@/modules/connections/hooks/useConnections"
import { useTelegram } from "@/modules/connections/hooks/useTelegram"
import { useMind, useMindWallet, usePayments, useRecentChats } from "@/modules/minds/hooks/useMinds"
import { setFlag, useFlag } from "@/modules/onboarding/data/progress"

export type Step = { id: string; title: string; line: string; href: string; done: boolean }

/**
 * The steps, each checked from what really happened (Ancung, 11 Nov: an app guide for first
 * visits, picked over a click-through tour). A try-out has no limits or funds of its own and
 * can't connect apps, so it gets the steps it can do.
 */
export function gettingStartedSteps(
  mindId: string,
  name: string,
  s: { tryOut: boolean; chatted: boolean; limits: boolean; funded: boolean; paid: boolean; live: boolean; connected: boolean; attacked: boolean }
): Step[] {
  const steps: (Step & { owner?: boolean })[] = [
    { id: "chat", title: `Say hi to ${name}`, line: "Ask what it can do, or for your balance.", href: mindHref(mindId, "chat"), done: s.chatted },
    { id: "limits", title: "Set its limits", line: "How much per payment and per day, and who it may pay.", href: mindHref(mindId, "wallet"), done: s.limits, owner: true },
    { id: "funds", title: "Add funds", line: `Send testnet NEAR to ${name}'s wallet from Meteor.`, href: mindHref(mindId, "wallet"), done: s.funded, owner: true },
    { id: "pay", title: "Ask for a payment", line: "It asks you first, unless you set a rule, and the wallet checks your limits.", href: mindHref(mindId, "chat"), done: s.paid },
    { id: "live", title: "Explore the live view", line: "Drag or click a bubble to see what it used.", href: mindHref(mindId, "chat"), done: s.live },
    { id: "app", title: "Connect an app", line: "Gmail, Calendar, Notion, Telegram and more.", href: mindHref(mindId, "connections"), done: s.connected, owner: true },
    { id: "attack", title: "Try to trick it", line: "Run an attack and watch where it gets stopped.", href: mindHref(mindId, "attack"), done: s.attacked },
  ]
  return steps.filter((x) => !(s.tryOut && x.owner)).map(({ owner: _owner, ...x }) => x)
}

/** "Getting started" at the bottom of the sidebar: progress, and the steps in a popover. */
export function GettingStarted({ mindId, onNavigate }: { mindId: string; onNavigate?: () => void }) {
  const closed = useFlag("done")
  const live = useFlag("live")
  const attacked = useFlag("attack")
  const tryOut = useIsTryOut()
  const mind = useMind(mindId).data
  const wallet = useMindWallet(mindId).data
  const payments = usePayments(mindId).data
  const chats = useRecentChats(mindId).data
  const connections = useConnections().data
  const telegram = useTelegram(mindId).data
  const [open, setOpen] = useState(false)

  if (!mind) return null
  const name = mind.name
  const steps = gettingStartedSteps(mindId, name, {
    tryOut,
    chatted: Boolean(chats?.length),
    limits: Boolean(wallet?.policy?.perTransactionNear),
    funded: Boolean(wallet && compareNear(wallet.balanceNear, "0") === 1),
    paid: Boolean(payments?.some((p) => p.status === "sent")),
    live,
    connected: Boolean(connections?.some((c) => c.status === "connected") || (telegram?.connected && telegram.linked)),
    attacked,
  })
  const done = steps.filter((x) => x.done).length
  const all = done === steps.length
  // Only closable once everything is checked.
  if (all && closed) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex w-full flex-col gap-2 rounded-md border border-border px-3 py-2.5 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus aria-expanded:bg-surface-hover"
          />
        }
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-foreground">{all ? "You're all set" : "Getting started"}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {done} of {steps.length}
            <ChevronRightIcon className="size-3.5" />
          </span>
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${(done / steps.length) * 100}%` }} />
        </span>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" sideOffset={12} className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-2">
        <div className="flex flex-col gap-0.5 px-2.5 pt-2 pb-3">
          <p className="text-sm font-semibold text-foreground">Getting started with {name}</p>
          <p className="text-xs text-muted-foreground">
            {all ? `That's everything. Ask ${name} how anything works, any time.` : "Each step checks itself off when you do it."}
          </p>
        </div>
        <ol className="flex flex-col">
          {steps.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                onClick={() => {
                  setOpen(false)
                  onNavigate?.()
                }}
                className="flex items-start gap-3 rounded-md px-2.5 py-2 outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    step.done ? "border-transparent bg-success text-background" : "border-border-strong"
                  )}
                >
                  {step.done && <CheckIcon className="size-3" strokeWidth={3} />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn("text-[13px] font-medium", step.done ? "text-muted-foreground line-through decoration-1" : "text-foreground")}>{step.title}</span>
                  {!step.done && <span className="text-xs text-muted-foreground">{step.line}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-between gap-2 px-1 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setOpen(false)
              setFlag("welcome", false)
            }}
          >
            Watch the intro
          </Button>
        {all && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setOpen(false)
                setFlag("done")
              }}
            >
              Done
            </Button>
          </div>
        )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
