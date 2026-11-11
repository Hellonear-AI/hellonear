// Every React Query key in one place, so a screen that invalidates one names the same key the
// hook reads. Keys under ["minds"] go stale together when a Mind changes (`mindKeys.all`).

export const sessionKey = ["session"] as const

export const mindKeys = {
  all: ["minds"] as const,
  templates: ["templates"] as const,
  /** The whole Mind (soul, model), which the shell's list leaves out (Settings). */
  full: (mindId: string) => ["minds", mindId, "full"] as const,
  approvals: (mindId: string) => ["minds", mindId, "approvals"] as const,
  wallet: (mindId: string) => ["minds", mindId, "wallet"] as const,
  payments: (mindId: string) => ["minds", mindId, "wallet", "payments"] as const,
  recentChats: (mindId: string) => ["minds", mindId, "threads", "recent"] as const,
  /** What the Mind remembers about its owner (#209, Settings). */
  memory: (mindId: string) => ["minds", mindId, "memory"] as const,
  /** A try-out's runs across its Minds, counted against its message limit. */
  tryOutRuns: (mindIds: string) => ["minds", "try-out-runs", mindIds] as const,
}

export const chatKeys = {
  thread: (mindId: string, threadId: string) => ["minds", mindId, "threads", threadId] as const,
  run: (runId: string) => ["runs", runId] as const,
  /** The user message that started a run (Approvals' "You asked"). */
  asked: (runId: string) => ["runs", runId, "asked"] as const,
}

export const autopilotKeys = {
  list: (mindId: string) => ["minds", mindId, "workflows"] as const,
  one: (mindId: string, id: string) => ["minds", mindId, "workflows", id] as const,
  autopilot: (mindId: string, id: string) => ["minds", mindId, "workflows", id, "autopilot"] as const,
  runs: (mindId: string, id: string) => ["minds", mindId, "workflows", id, "runs"] as const,
}

export const skillKeys = { catalog: ["skills"] as const }

/** The account's app connections (Gmail, Google Calendar, Google Meet). */
export const connectionKeys = { all: ["connections"] as const }

/** A Mind's Telegram bot (#168). */
export const telegramKeys = { mind: (mindId: string) => ["telegram", mindId] as const }

export const secretKeys = { all: ["secrets"] as const }

/** Outside ["minds"] on purpose: a week of events is heavy, so a Mind change doesn't refetch it. */
export const graphKeys = { events: (mindId: string) => ["mind-events", mindId] as const }

export const attackKeys = { list: ["attacks"] as const }

/** The owner's own NEAR balance from the RPC (Add funds). */
export const ownerKeys = { balance: (account: string | null) => ["owner-balance", account] as const }
