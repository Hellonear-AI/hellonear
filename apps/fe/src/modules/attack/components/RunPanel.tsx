"use client"

import { Spinner } from "@/components/elements/Spinner"
import { Badge } from "@/components/ui/badge"
import { formatNear } from "@/lib/format"
import { type ApiAttack } from "@/modules/attack/api"
import { attackCopy } from "@/modules/attack/data/attacks"
import { attackOutcome } from "@/modules/attack/data/outcome"
import { StepRow } from "@/modules/runs/components/ReplySteps"
import { ReplyText } from "@/modules/runs/components/ReplyText"
import { Working } from "@/modules/runs/components/Working"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { foldRun, type RunEvent } from "@/modules/runs/data/events"
import { type ApiWallet } from "@/modules/wallet/api"
import { Result } from "@/modules/attack/components/AttackResult"

export type Run = {
  attack: ApiAttack
  events: RunEvent[]
  streaming: boolean
  answered: "approve" | "decline" | null
  failed: boolean
}

export function RunPanel({ run, wallet, onAnswer }: { run: Run; wallet: ApiWallet | null; onAnswer: (action: "approve" | "decline") => void }) {
  const outcome = attackOutcome(run)
  const view = foldRun(run.events)
  const copy = attackCopy(run.attack)
  const balance = wallet ? `${formatNear(wallet.balanceNear)} NEAR` : null

  // One conversation, like the chat (Ancung, 10 Nov): the attack as the message sent, the test
  // Mind's reply under its avatar, then the result card where the chat puts its cards.
  return (
    <section aria-labelledby="doing" className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="doing" className="text-[15px] font-semibold text-foreground">
          {copy.title}
        </h2>
        {run.streaming && (
          <Badge variant="neutral">
            <Spinner />
            Live
          </Badge>
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <span className="text-xs text-muted-foreground">Sent to the Mind</span>
        <p className="max-w-[85%] rounded-[18px_18px_4px_18px] bg-primary px-4 py-2.5 text-[15px] leading-[22px] break-words whitespace-pre-wrap text-primary-foreground">
          {run.attack.message}
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <MindAvatar templateId={run.attack.templateId} size={24} />
          <span className="text-[13px] font-semibold text-foreground">Test Mind</span>
        </div>
        {view.tools.length > 0 && (
          <div className="flex flex-col gap-1">
            {view.tools.map((t) => (
              <StepRow key={t.toolCallId} step={t} />
            ))}
          </div>
        )}
        {view.text && <ReplyText text={view.text} live={run.streaming} />}
        {run.streaming && !view.text && <Working name="Test Mind" />}
        {/* While it runs, the thinking dots and step rows say so; the card comes with the result. */}
        {outcome.kind !== "running" && (
          // Part of the reply, not a card of its own: the panel is already the card.
          <div aria-live="polite" className="flex flex-col gap-4 pt-3">

            <Result outcome={outcome} copy={copy} wallet={wallet} balance={balance} onAnswer={onAnswer} />
          </div>
        )}
      </div>
    </section>
  )
}
