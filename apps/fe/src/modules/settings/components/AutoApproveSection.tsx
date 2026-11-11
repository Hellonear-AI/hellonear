"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MailIcon, StoreIcon, WalletIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { isApiCode } from "@/lib/api"
import { mindsApi, type ApiMind, type AutoApprove } from "@/modules/minds/api"
import { mindKeys } from "@/modules/minds/hooks/useMinds"
import { useSkillCatalog } from "@/modules/skills/hooks/useSkills"
import type { ApiWallet } from "@/modules/wallet/api"
import { isValidMaxNear, NO_RULES, overWalletLimit, rulesFor, sameRules } from "@/modules/settings/data/autoApprove"
import { SaveBar, SettingsGroup, SettingsRow } from "@/modules/settings/components/SettingsParts"
import { APPS } from "@/modules/connections/data/apps"

const DEFAULT_MAX_NEAR = "0.1"

/**
 * Approvals, "what {name} may do without asking" (#167; laid out as rows in its own tab, Ancung, 11 Nov): one switch per approval action the Mind's skills have, and a payment
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

  const onCount = actions.filter((a) => rules.tools.includes(a.tool)).length
  const allOn = actions.length > 0 && onCount === actions.length
  /** Every action's switch on or off; tools no skill of this Mind has are left as they are. */
  const setAll = (on: boolean) => {
    const shown = new Set(actions.map((a) => a.tool))
    const others = rules.tools.filter((t) => !shown.has(t))
    setDraft({ ...rules, tools: on ? [...others, ...shown] : others })
  }

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

  if (!catalog) return <Skeleton className="h-64 w-full rounded-lg" />
  if (!actions.length && !pays) {
    return <p className="text-[13px] text-muted-foreground">None of {name}&apos;s skills need your approval, so there is nothing to choose here yet.</p>
  }

  return (
    // Not the page's full width: the switches stay near their labels (Ancung, 11 Nov).
    <div className="flex max-w-[600px] flex-col gap-8">
      <p className="text-[13px] text-muted-foreground">
        Everything here is off until you turn it on. Anything left off waits for your approval in the chat. The chat still shows each action, marked as approved by your rule.
        {tryOut && " A try-out Mind always asks; connect a wallet to choose this."}
      </p>

      {pays && (
        <SettingsGroup title="Payments">
          <SettingsRow
            icon={<WalletIcon />}
            label="Send payments without asking"
            htmlFor="auto-pay"
            description={
              listed.length
                ? `Only to the ${listed.length === 1 ? "account" : `${listed.length} accounts`} on your wallet's list. Anything else still asks.`
                : "Your wallet has no list of accounts yet, so every payment still asks. Add accounts in Wallet."
            }
            control={
              <Switch
                id="auto-pay"
                checked={Boolean(rules.payment)}
                disabled={tryOut}
                onCheckedChange={(on) => setDraft({ ...rules, payment: on ? { maxNear } : null })}
              />
            }
            below={
              rules.payment && (
                <div className="flex flex-col gap-2 animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none">
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
                  {listed.length > 0 && <p className="text-xs text-muted-foreground">To {listed.slice(0, 3).join(", ")}{listed.length > 3 ? ` and ${listed.length - 3} more` : ""}.</p>}
                  {overWalletLimit(maxNear, limit) && (
                    <p className="text-xs text-warning">Your wallet limit is {limit} NEAR per payment, so anything above it is still refused before signing.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Your wallet&apos;s limits still check every payment before it is signed.</p>
                </div>
              )
            }
          />
        </SettingsGroup>
      )}

      {actions.length > 0 && (
        <SettingsGroup
          title="Apps and email"
          description="Each action asks you first unless you turn it on here. Payments stay separate."
          // All at once, beside the heading so it reads as the group's switch, not one more action
          // (Ancung, 11 Nov). Payments stay apart on purpose: money gets its own switch and amount.
          control={
            <>
              <label htmlFor="auto-all" className="text-xs text-muted-foreground">
                {onCount} of {actions.length} on
              </label>
              <Switch id="auto-all" aria-label="All apps and email" checked={allOn} disabled={tryOut} onCheckedChange={setAll} />
            </>
          }
        >
          {actions.map((a) => {
            const on = rules.tools.includes(a.tool)
            const id = `auto-${a.tool}`
            return (
              <SettingsRow
                key={a.tool}
                icon={actionIcon(a.tool)}
                label={a.label}
                htmlFor={id}
                description={on && a.warning ? <span className="text-warning">{a.warning}</span> : a.warning ? `When on: ${a.warning.charAt(0).toLowerCase()}${a.warning.slice(1)}` : undefined}
                control={<Switch id={id} checked={on} disabled={tryOut} onCheckedChange={(v) => toggle(a.tool, v)} />}
              />
            )
          })}
        </SettingsGroup>
      )}

      {changed && (
        <SaveBar message="You changed what can happen without asking.">
          <Button variant="ghost" disabled={save.isPending} onClick={() => { setDraft(null); setMaxInput(null) }}>
            Discard
          </Button>
          <Button disabled={!amountOk || save.isPending || tryOut} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />}
            Save rules
          </Button>
        </SaveBar>
      )}
    </div>
  )
}

/** Each action's app logo (the same as Connections), so the list can be scanned by app. */
function actionIcon(tool: string): ReactNode {
  if (tool === "mail_send" || tool === "mail_send_to_owner") return <MailIcon />
  if (tool === "sell_offer") return <StoreIcon />
  const app = APPS.find((x) => tool.startsWith(`${x.toolkit}_`))
  return app?.logo ?? null
}
