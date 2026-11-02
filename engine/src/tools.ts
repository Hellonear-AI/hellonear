// Tool registry. A tool's key in the agent's `tools` object is what Mastra reports as
// `payload.toolName`, so every tool is registered under a key equal to its id (spike #5).
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

const getTime = createTool({
  id: 'get_time',
  description: 'Get the current time in UTC as an ISO 8601 string.',
  inputSchema: z.object({}),
  outputSchema: z.object({ utc: z.string() }),
  execute: async () => ({ utc: new Date().toISOString() }),
})

const addNumbers = createTool({
  id: 'add_numbers',
  description: 'Add two numbers and return the sum.',
  inputSchema: z.object({ a: z.number(), b: z.number() }),
  outputSchema: z.object({ sum: z.number() }),
  execute: async ({ a, b }) => ({ sum: a + b }),
})

// Stand-in for a wallet action until the OutLayer tools land (#13, #14). Moves no money.
const demoTransfer = createTool({
  id: 'demo_transfer',
  description: 'Send a payment to a recipient. Always requires the owner to approve.',
  inputSchema: z.object({ to: z.string(), amountUsdc: z.number().positive() }),
  outputSchema: z.object({ status: z.literal('simulated'), to: z.string(), amountUsdc: z.number() }),
  requireApproval: true,
  execute: async ({ to, amountUsdc }) => ({ status: 'simulated' as const, to, amountUsdc }),
})

export const toolRegistry = { get_time: getTime, add_numbers: addNumbers, demo_transfer: demoTransfer } as const
export type ToolKey = keyof typeof toolRegistry

// Tools every Mind has, plus the tools of its equipped skills. Unknown keys are ignored.
export function toolsFor(skillToolKeys: string[]) {
  const keys = new Set<string>(['get_time', ...skillToolKeys])
  return Object.fromEntries([...keys].filter((k): k is ToolKey => k in toolRegistry).map((k) => [k, toolRegistry[k]]))
}
