// Mind Graph node ids (docs/api-contract.md §4). Pure functions, no config or network.
const WALLET_TOOLS = new Set(['send_payment', 'get_balance', 'list_payments'])
const APP_TOOL = /^gmail_/

// Mastra's built-in skill tools take the skill name in different arguments.
const SKILL_NAME_ARG: Record<string, string> = { skill: 'name', skill_read: 'skillName' }

export function nodeIdFor(mindId: string, tool: string, args?: Record<string, unknown>): string {
  const skillArg = SKILL_NAME_ARG[tool]
  if (skillArg && typeof args?.[skillArg] === 'string') return `skill:${args[skillArg]}`
  if (WALLET_TOOLS.has(tool)) return `wallet:${mindId}`
  // App tools are named <app>_<action> (e.g. gmail_list_emails), one App node per app.
  if (APP_TOOL.test(tool)) return `app:${tool.split('_')[0]}`
  return `tool:${tool}`
}

// A Visual Builder step (#20) on the Mind Graph: agent steps are the Mind itself.
export type BuilderStep = { node: string; type: 'agent' | 'tool' | 'http'; tool?: string }
export const builderNodeId = (mindId: string, s: BuilderStep) => (s.type === 'agent' ? `mind:${mindId}` : nodeIdFor(mindId, s.tool!))
