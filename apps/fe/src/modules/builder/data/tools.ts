// The tools a Builder job can use (design B1 "Use a tool: check balance, time, math"), in people's
// words. Only tools that run unattended and need no key or approval (engine/src/builder.ts refuses
// approval tools; docs/api-contract.md §2). Fields are from each tool's output schema in
// engine/src/tools.ts, so an If can only look at something the tool really returns.

/** "list" results (emails, events) can go into an Ask step, but an If can only compare a number or text. */
export type FieldKind = "number" | "text" | "list"

export type BuilderTool = {
  tool: string
  title: string
  line: string
  args: { name: string; label: string; kind: "account" }[]
  fields: { name: string; label: string; kind: FieldKind }[]
}

export const TOOLS: BuilderTool[] = [
  {
    tool: "near_view_account",
    title: "Check a NEAR account",
    line: "Its balance on testnet",
    args: [{ name: "accountId", label: "Account", kind: "account" }],
    fields: [{ name: "balanceNear", label: "Balance (NEAR)", kind: "number" }],
  },
  {
    tool: "get_time",
    title: "Check the time",
    line: "Today's date, time and weekday",
    args: [],
    fields: [
      { name: "weekday", label: "Weekday", kind: "text" },
      { name: "time", label: "Time (like 08:00)", kind: "text" },
      { name: "date", label: "Date (like 2026-11-09)", kind: "text" },
    ],
  },
  {
    tool: "googlecalendar_list_events",
    title: "Read the calendar",
    line: "Upcoming events from Google Calendar",
    args: [],
    fields: [{ name: "events", label: "Calendar events", kind: "list" }],
  },
  {
    tool: "gmail_list_emails",
    title: "Read the inbox",
    line: "Recent emails from Gmail",
    args: [],
    fields: [{ name: "emails", label: "Emails", kind: "list" }],
  },
]

/** "Call a website" (an http node, the Other apps skill): what its answer gives an If or a prompt. */
export const HTTP_FIELDS: BuilderTool["fields"] = [
  { name: "status", label: "Status code (like 200)", kind: "number" },
  { name: "body", label: "Answer", kind: "text" },
]

export const toolInfo = (tool: string) => TOOLS.find((t) => t.tool === tool) ?? null
export const fieldInfo = (tool: string, field: string) => toolInfo(tool)?.fields.find((f) => f.name === field) ?? null

/** NEAR testnet account ids: named (`shop.testnet`) or implicit (64 hex). */
export const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
