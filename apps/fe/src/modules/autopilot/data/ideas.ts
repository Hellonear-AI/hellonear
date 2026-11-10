// The two ready jobs on an empty Autopilot (design P1.2: "two ready ideas that really work today").
// Each is a real canvas (docs/api-contract.md §2 rules): nothing that pays or needs a key, so it can
// run unattended. The balance check reads the Mind's own wallet address with near_view_account,
// so the Mind needs the NEAR account lookup skill (a workflow may only use its Mind's tools).

import type { Canvas } from "@/modules/autopilot/api"

export type Idea = {
  workflowId: string
  title: string
  line: string
  /** A skill the Mind must have for this job's tools. */
  needsSkill?: string
  /** Needs the Mind's wallet address. */
  needsWallet?: boolean
  canvas: (ctx: { timezone: string; address: string | null }) => Canvas
}

const at = (y: number) => ({ x: 0, y })

export const IDEAS: Idea[] = [
  {
    workflowId: "morning-balance-check",
    title: "Morning balance check",
    line: "Every day, tells you if the wallet is under 5 NEAR.",
    needsSkill: "near-account",
    needsWallet: true,
    canvas: ({ timezone, address }) => ({
      name: "Morning balance check",
      nodes: [
        { id: "start", type: "trigger", position: at(0), data: { schedule: { cron: "0 8 * * *", timezone } } },
        { id: "balance", type: "tool", position: at(140), data: { tool: "near_view_account", args: { accountId: address ?? "" } } },
        { id: "low", type: "condition", position: at(280), data: { left: "{{steps.balance.balanceNear}}", op: "lt", right: 5 } },
        {
          id: "note",
          type: "agent",
          position: at(420),
          data: { prompt: "In one short line, tell the owner the wallet has {{steps.balance.balanceNear}} NEAR, under 5 NEAR, and that Add funds is in Wallet." },
        },
      ],
      edges: [
        { source: "start", target: "balance" },
        { source: "balance", target: "low" },
        { source: "low", target: "note", sourceHandle: "then" },
      ],
    }),
  },
  {
    workflowId: "plan-my-day",
    title: "Plan my day",
    line: "Weekdays, a short plan for the day.",
    canvas: ({ timezone }) => ({
      name: "Plan my day",
      nodes: [
        { id: "start", type: "trigger", position: at(0), data: { schedule: { cron: "30 7 * * 1-5", timezone } } },
        {
          id: "plan",
          type: "agent",
          position: at(140),
          data: { prompt: "Write the owner a short plan for today: at most five bullet points with times. Use their calendar if you can read it; otherwise keep it general." },
        },
      ],
      edges: [{ source: "start", target: "plan" }],
    }),
  },
]
