// Mind Graph node ids (docs/api-contract.md §4). Pure functions, no config or network.
// buy_data (#150) and buy_from_mind (#181) pay from the wallet, get_quotes (#176) and make_offer read its policy and its shop and sell_offer (#181)
// sells into it, so they are drawn on the wallet node.
const WALLET_TOOLS = new Set(['send_payment', 'get_balance', 'list_payments', 'buy_data', 'get_quotes', 'make_offer', 'sell_offer', 'buy_from_mind'])
// mail_* is the Mind's own AgentMail address (#96): one `app:mail` node. The business apps (#194) follow the same rule.
const APP_TOOL = /^(gmail|googlecalendar|mail|googlesheets|googledrive|googledocs|slack|notion|outlook|zoom)_/

// Mastra's built-in skill tools take the skill name in different arguments.
const SKILL_NAME_ARG: Record<string, string> = { skill: 'name', skill_read: 'skillName' }

// The model sometimes names a skill by Mastra's internal path ("inline/best-price/SKILL.md", seen 11 Nov) instead of its
// id; the node is the same skill either way.
export const skillIdOf = (name: string) => name.replace(/^inline\//, '').replace(/\/SKILL\.md$/i, '')

export function nodeIdFor(mindId: string, tool: string, args?: Record<string, unknown>): string {
  const skillArg = SKILL_NAME_ARG[tool]
  if (skillArg && typeof args?.[skillArg] === 'string') return `skill:${skillIdOf(args[skillArg] as string)}`
  if (WALLET_TOOLS.has(tool)) return `wallet:${mindId}`
  // App tools are named <app>_<action> (e.g. gmail_list_emails), one App node per app.
  if (APP_TOOL.test(tool)) return `app:${tool.split('_')[0]}`
  return `tool:${tool}`
}

// A Visual Builder step (#20) on the Mind Graph: agent steps are the Mind itself.
export type BuilderStep = { node: string; type: 'agent' | 'tool' | 'http'; tool?: string; way?: true; order?: number }
export const builderNodeId = (mindId: string, s: BuilderStep) => (s.type === 'agent' ? `mind:${mindId}` : nodeIdFor(mindId, s.tool!))
