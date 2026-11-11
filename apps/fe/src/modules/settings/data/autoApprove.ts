import type { AutoApprove } from "@/modules/minds/api"

/**
 * Auto-approve rules (#167): the actions an owner can let a Mind do without asking. The ids are the engine's
 * `SWITCHABLE_TOOLS` (engine/src/autoApprove.ts) and the backend's `AUTO_APPROVE_TOOLS`; the engine decides per
 * call. Payments are not a switch: they have their own rule (an amount, and only accounts on the wallet's list).
 */
export type ActionRule = { tool: string; label: string; warning?: string }

export const ACTION_RULES: ActionRule[] = [
  { tool: "googlecalendar_create_event", label: "Add an event to your calendar" },
  { tool: "googlecalendar_create_meeting", label: "Schedule a meeting with guests", warning: "Guests get Google's invite in your name right away." },
  { tool: "gmail_organize", label: "Archive or label your emails" },
  { tool: "mail_send", label: "Send an email from its own address", warning: "A sent email can't be taken back." },
  { tool: "mail_send_to_owner", label: "Email you" },
  { tool: "googlesheets_append_row", label: "Add a row to a Google Sheet" },
  { tool: "googlesheets_update_cells", label: "Change cells in a Google Sheet", warning: "The old value is replaced; Google Sheets keeps its version history." },
  { tool: "googledocs_create_document", label: "Create a Google Doc" },
  { tool: "googledocs_append_text", label: "Add text to the end of a Google Doc" },
  { tool: "notion_create_page", label: "Add a Notion page" },
  { tool: "notion_add_row", label: "Add a row to a Notion database" },
  { tool: "notion_update_row", label: "Change a row in a Notion database", warning: "The old value is replaced." },
  { tool: "slack_send_message", label: "Post a Slack message", warning: "Everyone in the channel sees it at once." },
  { tool: "zoom_create_meeting", label: "Schedule a Zoom meeting" },
  { tool: "sell_offer", label: "Publish something for sale" },
]

export const NO_RULES: AutoApprove = { tools: [], payment: null }

/** The rules the Mind's equipped skills can use: a switch for a tool none of its skills has would do nothing. */
export const rulesFor = (equippedTools: ReadonlySet<string>) => ACTION_RULES.filter((r) => equippedTools.has(r.tool))

/** Same rule as the backend: a decimal NEAR amount, more than 0 and at most 10. */
export const isValidMaxNear = (v: string) => /^\d{1,2}(\.\d{1,24})?$/.test(v) && /[1-9]/.test(v) && Number(v) <= 10

/** Rules compared as the backend stores them (tool order doesn't matter). */
export const sameRules = (a: AutoApprove, b: AutoApprove) =>
  [...a.tools].sort().join() === [...b.tools].sort().join() && (a.payment?.maxNear ?? null) === (b.payment?.maxNear ?? null)

/** The payment rule's amount above the wallet's own per-payment limit is still refused before signing. */
export const overWalletLimit = (maxNear: string, perTransactionNear: string | null | undefined) =>
  Boolean(perTransactionNear) && isValidMaxNear(maxNear) && Number(maxNear) > Number(perTransactionNear)
