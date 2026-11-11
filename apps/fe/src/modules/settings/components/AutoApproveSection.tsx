"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { isApiCode } from "@/lib/api"
import { mindsApi, type ApiMind, type AutoApprove } from "@/modules/minds/api"
import { mindKeys } from "@/modules/minds/hooks/useMinds"
import { useSkillCatalog } from "@/modules/skills/hooks/useSkills"
import type { ApiWallet } from "@/modules/wallet/api"
import { isValidMaxNear, NO_RULES, overWalletLimit, rulesFor, sameRules } from "@/modules/settings/data/autoApprove"

const DEFAULT_MAX_NEAR = "0.1"

/**
 * "What {name} may do without asking" (#167): one switch per approval action the Mind's skills have, and a payment
 * rule (up to an amount, only to the wallet's listed accounts). All off by default. Saved on its own with
 * `PATCH /minds/{id}` `{ autoApprove }`, apart from the name and voice bar. The engine decides per call; the wallet's
 * policy still checks every payment in its TEE. Try-outs see it locked.
 */
export function AutoApproveSection({ mind, name, wallet, tryOut }: { mind: ApiMind; name: string; wallet: ApiWallet | null | undefined; tryOut: boolean }) {
  const queryClient = useQueryClient()
  const catalog = useSkillCatalog().data
  const saved = mind.autoApprove ?? NO_RULES
  const [draft, setDraft] = useState<AutoApprove | null>(null)
  const [maxInput, setMaxInput] = useState<string | null>(null)
  const rules = draft ?? saved
  const maxNear = maxInput ?? saved.payment?.maxNear ?? DEFAULT_MAX_NEAR

  const equipped = new Set((catalog ?? []).filter((s) => mind.skills.includes(s.skillId)).flatMap((s) => s.tools))
  const actions = rulesFor(equipped)
  const pays = equipped.has("send_payment")
  const listed = wallet?.policy?.whitelist ?? []
  const limit = wallet?.policy?.perTransactionNear ?? null

  const next: AutoApprove = { tools: rules.tools, payment: rules.payment ? { maxNear: maxNear.trim() } : null }
  const amountOk = !next.payment || isValidMaxNear(next.payment.maxNear)
  const changed = !sameRules(next, saved)

  const toggle = (tool: string, on: boolean) =>
    setDraft({ ...rules, tools: on ? [...rules.tools, tool] : rules.tools.filter((t) => t !== tool) })

  const save = useMutation({
    mutationFn: () => mindsApi.update(mind.id, { autoApprove: next }),
    onSuccess: (updated) => {
      queryClient.setQueryData(mindKeys.full(mind.id), updated)
      setDraft(null)
      setMaxInput(null)
      toast.success("Rules saved")
    },
    onError: (err) =>
      toast.error("Could not save the rules", {
        description: isApiCode(err, "demo_not_allowed") ? "A try-out Mind always asks. Connect a wallet to make your own." : "Please try again later.",
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: mindKeys.all }),
  })

  if (!catalog) return null
  if (!actions.length && !pays) return null

  return (
    <section aria-labelledby="auto-title" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 id="auto-title" className="text-[15px] font-semibold text-foreground">
          What {name} may do without asking
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Everything here is off until you turn it on. Anything left off waits for your approval in the chat. The chat still shows each action, marked as approved by your rule.
          {tryOut && " A try-out Mind always asks; connect a wallet to choose this."}
        </p>
      </div>

      {pays && (
        <div className="flex flex-col gap-2 rounded-md bg-surface-muted p-4">
          <label className="flex items-center gap-3">
            <Switch
              checked={Boolean(rules.payment)}
              disabled={tryOut}
              onCheckedChange={(on) => setDraft({ ...rules, payment: on ? { maxNear } : null })}
              aria-label="Send payments without asking"
            />
            <span className="text-sm font-medium text-foreground">Send payments without asking</span>
          </label>
          {rules.payment && (
            <div className="flex flex-col gap-2 pl-[52px]">
              <label className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                Up to
                <Input
                  className="w-28"
                  inputMode="decimal"
                  value={maxNear}
                  aria-invalid={!amountOk}
                  aria-label="Most NEAR per payment without asking"
                  onChange={(e) => setMaxInput(e.target.value)}
                />
                NEAR per payment
              </label>
              {!amountOk && <p className="text-xs text-danger">Enter an amount above 0 and at most 10 NEAR.</p>}
              <p className="text-xs text-muted-foreground">
                {listed.length
                  ? `Only to the ${listed.length === 1 ? "account" : `${listed.length} accounts`} on your wallet's list (${listed.slice(0, 3).join(", ")}${listed.length > 3 ? ", …" : ""}). Anything else still asks.`
                  : "Your wallet has no list of accounts yet, so every payment still asks. Add accounts in Wallet."}
              </p>
              {overWalletLimit(maxNear, limit) && (
                <p className="text-xs text-warning">Your wallet limit is {limit} NEAR per payment, so anything above it is still refused before signing.</p>
              )}
              <p className="text-xs text-muted-foreground">Your wallet&apos;s limits still check every payment before it is signed.</p>
            </div>
          )}
        </div>
      )}

      {actions.length > 0 && (
        <ul className="flex flex-col gap-3">
          {actions.map((a) => {
            const on = rules.tools.includes(a.tool)
            return (
              <li key={a.tool} className="flex flex-col gap-1">
                <label className="flex items-center gap-3">
                  <Switch checked={on} disabled={tryOut} onCheckedChange={(v) => toggle(a.tool, v)} aria-label={a.label} />
                  <span className="text-sm text-foreground">{a.label}</span>
                </label>
                {on && a.warning && <p className="pl-[52px] text-xs text-warning">{a.warning}</p>}
              </li>
            )
          })}
        </ul>
      )}

      {changed && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={save.isPending} onClick={() => { setDraft(null); setMaxInput(null) }}>
            Discard
          </Button>
          <Button disabled={!amountOk || save.isPending || tryOut} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />}
            Save rules
          </Button>
        </div>
      )}
    </section>
  )
}
