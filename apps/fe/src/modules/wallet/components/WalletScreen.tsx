"use client"

import { CheckIcon, CircleSlashIcon, CopyIcon, HourglassIcon, PlusIcon, SnowflakeIcon, WalletIcon, XIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { cn } from "cn"
import { PageTitle } from "@/components/elements/PageTitle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatNear } from "@/lib/format"
import { useSession } from "@/modules/auth/hooks/useSession"
import type { ApiWallet } from "@/modules/minds/api"
import { useMind, useMindWallet, usePayments } from "@/modules/minds/hooks/useMinds"
import { activityLine, filterActivity, spentToday, type ActivityFilter } from "@/modules/wallet/data/activity"
import { shortAddress } from "@/modules/wallet/data/address"
import { AddFundsDialog } from "@/modules/wallet/components/AddFundsDialog"
import { FreezeDialog } from "@/modules/wallet/components/FreezeDialog"
import { LimitsDialog } from "@/modules/wallet/components/LimitsDialog"

type Open = "limits" | "funds" | "freeze" | null

/**
 * Wallet (design "5 · Money", W1): the balance, what was spent today, recent activity, and the
 * limits next to the money they protect. States: normal (W1.1), empty (W1.2, Add funds leads),
 * frozen (W1.4), loading (W1.5), no wallet yet (W1.6). Owner actions open W2 (limits),
 * W4 (add funds) and W3 (freeze); try-out users and the shared demo wallet only read.
 */
export function WalletScreen({ mindId }: { mindId: string }) {
  const mind = useMind(mindId).data
  const walletQuery = useMindWallet(mindId)
  const wallet = walletQuery.data
  const demo = Boolean(useSession().data?.demo)
  const [open, setOpen] = useState<Open>(null)
  // A new key per opening, so each dialog starts from what is saved.
  const [opened, setOpened] = useState(0)
  const show = (which: Open) => {
    setOpened((n) => n + 1)
    setOpen(which)
  }

  const name = mind?.name ?? "Your Mind"
  const readOnly = demo || Boolean(wallet?.shared)
  const empty = wallet ? Number(wallet.balanceNear) === 0 : false
  const noLimits = Boolean(wallet && !wallet.policy?.perTransactionNear)

  const header = (
    <PageTitle
      title="Wallet"
      description={wallet === null ? `${name} has no wallet, so it can't pay for anything yet.` : `${name}'s own wallet. It can only spend inside the limits you set.`}
      actions={
        wallet && !readOnly ? (
          <>
            <Button variant={empty ? "default" : "outline"} onClick={() => show("funds")}>
              <PlusIcon />
              Add funds
            </Button>
            <Button variant={wallet.frozen ? "outline" : "destructive"} onClick={() => show("freeze")}>
              <SnowflakeIcon />
              {wallet.frozen ? "Unfreeze" : "Freeze wallet"}
            </Button>
          </>
        ) : undefined
      }
    />
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 xl:p-8">
      {header}

      {walletQuery.isPending ? (
        <Loading />
      ) : walletQuery.isError ? (
        <Card className="items-start">
          <p className="text-sm text-muted-foreground">Couldn&apos;t reach the wallet service. Try again in a moment.</p>
          <Button variant="outline" onClick={() => void walletQuery.refetch()}>
            Try again
          </Button>
        </Card>
      ) : wallet === null || wallet === undefined ? (
        <NoWallet name={name} demo={demo} onSetUp={() => show("limits")} />
      ) : (
        <>
          {wallet.frozen && (
            <div role="status" className="flex items-center gap-3 rounded-md bg-danger-soft px-4 py-2.5 text-sm text-foreground">
              <SnowflakeIcon className="size-4 shrink-0 text-danger" />
              <p className="min-w-0 flex-1">{name}&apos;s wallet is frozen. {name} and its skills can&apos;t send anything.</p>
              {!readOnly && (
                <button type="button" onClick={() => show("freeze")} className="shrink-0 rounded-sm font-semibold text-danger outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus">
                  Unfreeze
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-6">
              <Balance mindId={mindId} name={name} wallet={wallet} />
              <Activity mindId={mindId} name={name} />
            </div>
            {/* The limits stay in view beside the activity on desktop (Ancung, 9 Nov). */}
            <aside className="flex flex-col gap-6 xl:sticky xl:top-8 xl:w-[380px] xl:shrink-0">
              <LimitsCard name={name} wallet={wallet} readOnly={readOnly} noLimits={noLimits} onEdit={() => show("limits")} />
            </aside>
          </div>
        </>
      )}

      {/* Mounted only when there is something to act on; the key resets each opening. */}
      {!readOnly && wallet !== undefined && (
        <LimitsDialog key={`l${opened}`} mindId={mindId} name={name} wallet={wallet ?? null} open={open === "limits"} onOpenChange={(o) => setOpen(o ? "limits" : null)} />
      )}
      {!readOnly && wallet && (
        <>
          <AddFundsDialog key={`f${opened}`} mindId={mindId} name={name} wallet={wallet} open={open === "funds"} onOpenChange={(o) => setOpen(o ? "funds" : null)} />
          <FreezeDialog key={`z${opened}`} mindId={mindId} name={name} freeze={!wallet.frozen} open={open === "freeze"} onOpenChange={(o) => setOpen(o ? "freeze" : null)} />
        </>
      )}
    </div>
  )
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("flex flex-col gap-4 rounded-lg border border-border bg-surface p-5", className)}>{children}</section>
}

function Balance({ mindId, name, wallet }: { mindId: string; name: string; wallet: ApiWallet }) {
  const payments = usePayments(mindId, 50).data
  const today = payments ? spentToday(payments) : null
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked; the full address is in the button's title.
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground">Balance</span>
          <p className={cn("flex items-end gap-2 transition-opacity duration-200", wallet.frozen && "opacity-60")}>
            <span className="text-5xl leading-[48px] font-medium tracking-[-1.5px] text-foreground">{formatNear(wallet.balanceNear)}</span>
            <span className="text-base font-medium text-muted-foreground">NEAR</span>
          </p>
        </div>
        <button
          type="button"
          title={wallet.address}
          onClick={() => void copy()}
          aria-label={copied ? "Address copied" : `Copy ${name}'s address`}
          className="flex items-center gap-2 rounded-sm bg-muted px-3 py-2 font-mono text-[13px] text-foreground outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
        >
          {shortAddress(wallet.address)}
          {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5 text-muted-foreground" />}
        </button>
      </div>
      {wallet.frozen ? (
        <div className="rounded-md bg-muted px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <SnowflakeIcon className="size-3.5" />
            Frozen
          </p>
          <p className="text-xs text-muted-foreground">Nothing can be sent until you unfreeze.</p>
        </div>
      ) : today && today.count > 0 ? (
        <div className="rounded-md bg-muted px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">Spent today: {formatNear(today.total)} NEAR</p>
          <p className="text-xs text-muted-foreground">
            {today.count} {today.count === 1 ? "payment" : "payments"}, each one approved by you. This is a count, not a limit.
          </p>
        </div>
      ) : null}
    </Card>
  )
}

const TONE = {
  sent: { icon: CheckIcon, dot: "bg-success-soft text-success", badge: "success" as const, amount: "text-foreground" },
  blocked: { icon: CircleSlashIcon, dot: "bg-danger-soft text-danger", badge: "destructive" as const, amount: "text-muted-foreground" },
  failed: { icon: XIcon, dot: "bg-muted text-muted-foreground", badge: "neutral" as const, amount: "text-muted-foreground" },
  waiting: { icon: HourglassIcon, dot: "bg-warning-soft text-warning", badge: "warning" as const, amount: "text-foreground" },
}

function Activity({ mindId, name }: { mindId: string; name: string }) {
  const { data: payments, isPending, isError } = usePayments(mindId, 50)
  const [filter, setFilter] = useState<ActivityFilter>("all")
  const list = payments ? filterActivity(payments, filter).slice(0, 8) : []

  return (
    <Card>
      <h2 className="text-[15px] font-semibold text-foreground">Recent activity</h2>
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <p className="text-[13px] text-muted-foreground">Couldn&apos;t load the activity.</p>
      ) : !payments?.length ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-[15px] font-semibold text-foreground">No money moves yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            When {name} pays someone, or your limits stop a payment, it shows up here.
          </p>
        </div>
      ) : (
        <>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as ActivityFilter)}>
            <TabsList className="w-full border border-border">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
              <TabsTrigger value="blocked">Blocked</TabsTrigger>
            </TabsList>
          </Tabs>
          {list.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">
              {filter === "blocked" ? "Nothing blocked. When your limits stop a payment, it shows up here." : "Nothing sent yet."}
            </p>
          ) : (
            <ul className="flex flex-col">
              {list.map((p) => {
                const line = activityLine(p)
                const tone = TONE[line.tone]
                const Icon = tone.icon
                return (
                  <li key={p.paymentId} className="flex items-start gap-3 py-3">
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", tone.dot)}>
                      <Icon className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="truncate text-sm font-medium text-foreground">{line.title}</p>
                      <p className="text-xs text-muted-foreground">{line.note}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn("text-sm font-semibold", tone.amount)}>{line.amount}</span>
                      <Badge variant={tone.badge}>{line.badge}</Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}

function LimitsCard({ name, wallet, readOnly, noLimits, onEdit }: { name: string; wallet: ApiWallet; readOnly: boolean; noLimits: boolean; onEdit: () => void }) {
  const limit = wallet.policy?.perTransactionNear
  const count = wallet.policy?.whitelist?.length ?? 0
  return (
    <Card className="gap-3">
      <h2 className="text-[15px] font-semibold text-foreground">Your limits</h2>
      {noLimits ? (
        <>
          <p className="text-[13px] text-muted-foreground">
            {name} has no limits yet, so it can&apos;t pay anyone. Set them, and Meteor asks for your signature.
          </p>
          {!readOnly && (
            <Button className="w-fit" onClick={onEdit}>
              Set limits
            </Button>
          )}
        </>
      ) : (
        <>
          <Row label="Per payment" value={`Up to ${limit} NEAR`} action={readOnly ? null : "Edit"} onAction={onEdit} />
          <Row
            label={`Who ${name} can pay`}
            value={count === 1 ? "1 address you added" : `${count} addresses you added`}
            action={readOnly ? null : "Manage"}
            onAction={onEdit}
          />
          <p className="text-xs text-muted-foreground">
            {readOnly ? "This try-out pays from a shared test wallet. Connect a wallet to set your own limits." : `Saved where ${name} can't change them. Changes need your signature.`}
          </p>
        </>
      )}
    </Card>
  )
}

function Row({ label, value, action, onAction }: { label: string; value: string; action: string | null; onAction: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-sm font-semibold text-foreground">{value}</span>
      </div>
      {action && (
        <Button variant="outline" size="sm" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  )
}

/** W1.6: a Mind made without a wallet. It can chat and plan; paying needs a wallet, limits first. */
function NoWallet({ name, demo, onSetUp }: { name: string; demo: boolean; onSetUp: () => void }) {
  return (
    <Card className="items-center px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <WalletIcon className="size-5 text-muted-foreground" />
      </span>
      <p className="text-[15px] font-semibold text-foreground">{name} doesn&apos;t have a wallet yet</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {name} can chat and plan without one. To let it pay for things, set up a wallet; you choose its limits first.
      </p>
      {demo ? (
        <p className="text-xs text-muted-foreground">Connect a wallet to do this.</p>
      ) : (
        <Button onClick={onSetUp}>Set up a wallet</Button>
      )}
    </Card>
  )
}

/** W1.5: same blocks, grey shapes, no numbers until they are real. */
function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <div className="flex flex-1 flex-col gap-6">
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg xl:w-[380px]" />
    </div>
  )
}
