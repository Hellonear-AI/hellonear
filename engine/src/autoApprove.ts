// Auto-approve rules (#167): the owner chooses which approval tools a Mind may run without asking. The backend stores the
// rules per Mind and sends them with the Mind config; the engine decides per call, before Mastra would pause the run.
// The OutLayer policy stays the last layer: an auto-approved payment is still checked in the TEE before signing.
import { z } from 'zod'

// Approval tools a switch can cover. send_payment is not one: payments only go through the payment rule below.
export const SWITCHABLE_TOOLS = [
  'googlecalendar_create_event', 'googlecalendar_create_meeting', 'gmail_organize', 'mail_send', 'mail_send_to_owner',
  'googlesheets_append_row', 'googledocs_create_document', 'notion_create_page', 'notion_add_row', 'slack_send_message',
  'sell_offer',
] as const

const NEAR_ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
const nearAmount = z.string().regex(/^\d{1,3}(\.\d{1,24})?$/).refine((a) => /[1-9]/.test(a), 'must be more than 0')

export const autoApproveSchema = z.object({
  tools: z.array(z.enum(SWITCHABLE_TOOLS)).max(SWITCHABLE_TOOLS.length).default([]),
  // A payment runs without asking only up to maxNear, and only to an account in `recipients`: the backend fills it from
  // the wallet policy's address list for each run. No list (or an empty one) means no payment runs without asking.
  payment: z.object({
    maxNear: nearAmount,
    recipients: z.array(z.string().min(2).max(64).regex(NEAR_ACCOUNT_ID)).max(20).default([]),
  }).optional(),
})
export type AutoApprove = z.infer<typeof autoApproveSchema>

// Exact decimal comparison in yoctoNEAR, so 0.1 + rounding never lets 0.1000001 through.
const toYocto = (near: string) => {
  const [whole, frac = ''] = near.split('.')
  return BigInt(whole) * 10n ** 24n + BigInt(frac.padEnd(24, '0').slice(0, 24) || '0')
}

type RuleCtx = { autoApprove?: AutoApprove; demo?: boolean; unattended?: boolean }

// Which rule lets this call run without the owner, or null when it must wait for an approval. Try-outs (and the
// Attack Playground, which the backend marks demo) never skip the approval, whatever the config says.
export function ruleFor(tool: string, args: unknown, ctx: RuleCtx): 'tool' | 'payment' | null {
  const rules = ctx.autoApprove
  if (!rules || ctx.demo) return null
  if (tool === 'send_payment') {
    const { to, amountNear } = (args ?? {}) as { to?: unknown; amountNear?: unknown }
    const p = rules.payment
    if (!p || typeof to !== 'string' || typeof amountNear !== 'string' || !nearAmount.safeParse(amountNear).success) return null
    return p.recipients.includes(to) && toYocto(amountNear) <= toYocto(p.maxNear) ? 'payment' : null
  }
  return (rules.tools as readonly string[]).includes(tool) ? 'tool' : null
}
