// The tools a Builder job can use (design B1 "Use a tool: check balance, time, math"), in people's
// words. Only tools that run unattended and need no key or approval (engine/src/builder.ts refuses
// approval tools; docs/api-contract.md §2), plus the two that exist only as job steps and touch only
// the owner's own things, "Add to my calendar" and "Email me" (#146, engine CANVAS_ONLY). Fields are
// from each tool's output schema in engine/src/tools.ts, so an If can only look at something the
// tool really returns.

/** "list" results (emails, events) can go into an Ask step, but an If can only compare a number or text. */
export type FieldKind = "number" | "text" | "list"

export type BuilderTool = {
  tool: string
  title: string
  line: string
  /** account: a NEAR account; text: one line; time: HH:MM today; minutes: a length; note: text with the Mind's notes as chips. */
  args: { name: string; label: string; kind: "account" | "text" | "time" | "minutes" | "note"; placeholder?: string }[]
  /** Values for a new step of this tool. */
  defaults?: Record<string, string>
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
  {
    tool: "googlecalendar_block_time",
    title: "Add to my calendar",
    line: "An event today on your own calendar, no guests",
    args: [
      { name: "title", label: "Event name", kind: "text", placeholder: "Focus time" },
      { name: "at", label: "At", kind: "time" },
      { name: "minutes", label: "Minutes", kind: "minutes" },
    ],
    defaults: { title: "", at: "09:00", minutes: "30" },
    fields: [{ name: "link", label: "Event link", kind: "text" }],
  },
  {
    tool: "mail_send_to_owner",
    title: "Email me",
    line: "From the Mind's own address to your Gmail, nobody else",
    args: [
      { name: "subject", label: "Subject", kind: "text", placeholder: "Your morning brief" },
      { name: "text", label: "Email", kind: "note", placeholder: "Put in a note the Mind wrote in an earlier step." },
    ],
    defaults: { subject: "", text: "" },
    fields: [{ name: "status", label: "Email status", kind: "text" }],
  },
]

/** "Call a website" (an http node, the Other apps skill): what its answer gives an If or a prompt. */
export const HTTP_FIELDS: BuilderTool["fields"] = [
  { name: "status", label: "Status code (like 200)", kind: "number" },
  { name: "body", label: "Answer", kind: "text" },
]

export const toolInfo = (tool: string) => TOOLS.find((t) => t.tool === tool) ?? null

/** NEAR testnet account ids: named (`shop.testnet`) or implicit (64 hex). */
export const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
