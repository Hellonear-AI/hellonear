"use client"

import { useQuery } from "@tanstack/react-query"
import {
  MailIcon,
  MessageSquareWarningIcon,
  PuzzleIcon,
  SwordsIcon,
  TriangleAlertIcon,
  UserRoundXIcon,
  WalletMinimalIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "cn"
import { EmptyState } from "@/components/elements/EmptyState"
import { attackKeys } from "@/lib/queryKeys"
import { Spinner } from "@/components/elements/Spinner"
import { PageTitle } from "@/components/elements/PageTitle"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNear } from "@/lib/format"
import { attackApi, type ApiAttack } from "@/modules/attack/api"
import { attackCopy, KNOWN_ATTACKS, type AttackCopy } from "@/modules/attack/data/attacks"
import { attackOutcome } from "@/modules/attack/data/outcome"
import { type RunEvent } from "@/modules/runs/data/events"
import { walletApi } from "@/modules/wallet/api"
import { mindKeys } from "@/modules/minds/hooks/useMinds"
import { Run, RunPanel } from "@/modules/attack/components/RunPanel"
import { OutcomeBadge } from "@/modules/attack/components/OutcomeBadge"

const ICON: Record<AttackCopy["icon"], typeof MailIcon> = {
  message: MessageSquareWarningIcon,
  mail: MailIcon,
  skill: PuzzleIcon,
  owner: UserRoundXIcon,
}

/**
 * Attack Playground (design "8 · Attack Playground", X1.1 to X1.7, #16). Each attack runs on its own
 * playground Mind and the shared demo wallet, never on the owner's Minds or wallet (decided 9 Nov
 * with Ancung, as in docs/api-contract.md §2). The Mind may be fooled; the approval card is layer 1
 * and the wallet's limits in OutLayer's TEE are layer 2. The playground never approves for the owner.
 */
export function AttackScreen() {
  const list = useQuery({ queryKey: attackKeys.list, queryFn: attackApi.list, staleTime: 5 * 60_000 })
  const ready = Array.isArray(list.data)
  const attacks = list.data ?? KNOWN_ATTACKS
  const [run, setRun] = useState<Run | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  // The demo wallet the playground Mind pays from, once a run says which Mind it is.
  const mindId = run?.events.find((e) => e.mindId)?.mindId ?? null
  const wallet = useQuery({
    queryKey: mindId ? mindKeys.wallet(mindId) : ["minds", "none", "wallet"],
    queryFn: () => walletApi.wallet(mindId as string),
    enabled: Boolean(mindId),
  })

  async function follow(next: Run, go: (onEvent: (e: RunEvent) => void, signal: AbortSignal) => Promise<void>) {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setRun(next)
    const onEvent = (e: RunEvent) => setRun((r) => (r && r.attack.attackId === next.attack.attackId ? { ...r, events: [...r.events, e] } : r))
    let failed = false
    try {
      await go(onEvent, controller.signal)
    } catch {
      failed = !controller.signal.aborted
    }
    if (controller.signal.aborted) return
    setRun((r) => (r && r.attack.attackId === next.attack.attackId ? { ...r, streaming: false, failed } : r))
    // The balance shown afterwards is read again, so "balance still" is the wallet's word, not ours.
    void wallet.refetch()
  }

  function start(attack: ApiAttack) {
    void follow({ attack, events: [], streaming: true, answered: null, failed: false }, (onEvent, signal) =>
      attackApi.run(attack.attackId, onEvent, signal)
    )
  }

  function answer(action: "approve" | "decline") {
    if (!run) return
    const outcome = attackOutcome(run)
    const runId = run.events.find((e) => e.runId)?.runId
    if (outcome.kind !== "waiting" || !runId) return
    void follow({ ...run, streaming: true, answered: action, failed: false }, (onEvent, signal) =>
      attackApi.answer(runId, action, { toolCallId: outcome.step.toolCallId, attackId: run.attack.attackId }, onEvent, signal)
    )
  }

  const balance = wallet.data?.balanceNear

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 xl:p-8">
      <PageTitle
        title="Attack playground"
        description="Try to trick a Mind into paying a stranger. The wallet's limits should stop it every time."
        actions={
          balance !== undefined ? (
            <span className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-foreground">
              <WalletMinimalIcon className="size-3.5 text-muted-foreground" />
              Test wallet: {formatNear(balance)} NEAR
            </span>
          ) : undefined
        }
      />

      {list.data === null && (
        <div role="status" className="flex items-start gap-3 rounded-md bg-info-soft px-4 py-3 text-sm text-foreground">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-info" />
          <p>Running attacks needs a backend update that isn&apos;t live yet. You can read what each attack does in the meantime.</p>
        </div>
      )}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <section aria-labelledby="pick" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 xl:sticky xl:top-8 xl:w-[340px] xl:shrink-0">
          <h2 id="pick" className="text-[13px] text-muted-foreground">
            Pick an attack
          </h2>
          {list.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ul className="flex flex-col gap-2">
              {attacks.map((a) => {
                const copy = attackCopy(a)
                const mine = run?.attack.attackId === a.attackId ? run : null
                const outcome = mine ? attackOutcome(mine) : null
                const busy = Boolean(run?.streaming)
                const Icon = ICON[copy.icon]
                return (
                  <li key={a.attackId} className={cn("flex flex-col gap-2.5 rounded-md p-3", mine ? "bg-muted" : "bg-transparent")}>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{copy.title}</span>
                      {outcome && <OutcomeBadge outcome={outcome} />}
                    </div>
                    <p className="text-[13px] text-muted-foreground">{copy.line}</p>
                    <Button
                      size="sm"
                      variant={mine ? "outline" : "default"}
                      disabled={!ready || busy}
                      onClick={() => start(a)}
                      className="w-full"
                    >
                      {mine?.streaming && !mine.answered ? <Spinner /> : null}
                      {mine?.streaming && !mine.answered ? "Running" : mine ? "Run again" : "Run attack"}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {run ? (
            <RunPanel run={run} wallet={wallet.data ?? null} onAnswer={answer} />
          ) : (
            <EmptyState
              className="py-16"
              icon={<SwordsIcon />}
              title="Pick an attack to start"
              description="Each one runs on testnet with a test Mind and a shared test wallet, never your own. Nothing you do here costs real money."
            />
          )}
        </div>
      </div>
    </div>
  )
}
