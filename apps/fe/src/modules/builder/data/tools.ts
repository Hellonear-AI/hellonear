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
  args: { name: string; label: string; kind: "account" | "text" | "time" | "minutes" | "note"; placeholder?: string; optional?: boolean; hint?: string }[]
  /** Values for a new step of this tool. */
  defaults?: Record<string, string>
  fields: { name: string; label: string; kind: FieldKind }[]
  /** Turn what the owner typed into what the tool takes (a Sheets link into its id), on save. */
  toArgs?: (args: Record<string, string>) => Record<string, string>
}

/** The id in a Notion link (the 32 hex characters at the end of its path), or the text as it is. */
export const notionIdOf = (v: string) => v.match(/([0-9a-f]{32})(?:[?#]|$)/i)?.[1] ?? v.trim()

/** The id in a Google Sheets link (`…/spreadsheets/d/<id>/edit`), or the text as it is. */
export const sheetIdOf = (v: string) => v.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ?? v.trim()

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
  // Read-only tools of the track skills' apps (#211): they run unattended, so a job can read them.
  // Writing (a new Doc, a row, a Notion page, a Slack post) needs the owner's approval and can't.
  {
    tool: "googlesheets_read_range",
    title: "Read a Google Sheet",
    line: "Rows from one of your spreadsheets",
    args: [
      { name: "spreadsheetId", label: "Sheet link", kind: "text", placeholder: "https://docs.google.com/spreadsheets/d/…", hint: "Paste its link from the address bar." },
      { name: "range", label: "Cells", kind: "text", placeholder: "Sheet1!A1:D20", optional: true, hint: "Leave empty for the first sheet." },
    ],
    defaults: { spreadsheetId: "", range: "" },
    fields: [{ name: "values", label: "Rows", kind: "list" }],
    toArgs: (a) => ({ ...a, spreadsheetId: sheetIdOf(a.spreadsheetId ?? "") }),
  },
  {
    tool: "googledocs_read_document",
    title: "Read a Google Doc",
    line: "The text of one of your Docs",
    args: [{ name: "id", label: "Doc link", kind: "text", placeholder: "https://docs.google.com/document/d/…", hint: "Paste its link from the address bar." }],
    defaults: { id: "" },
    fields: [
      { name: "title", label: "Doc title", kind: "text" },
      { name: "text", label: "Doc text", kind: "list" },
    ],
  },
  {
    tool: "notion_search",
    title: "Search Notion",
    line: "Pages you shared with HelloNear, by title",
    args: [{ name: "query", label: "Words in the title", kind: "text", placeholder: "Tasks" }],
    defaults: { query: "" },
    fields: [{ name: "results", label: "Pages found", kind: "list" }],
  },
  // Read steps for #252's tools (Ancung, 11 Nov). They read only, so a job may run them.
  {
    tool: "notion_query_database",
    title: "Read a Notion database",
    line: "The rows of one of your Notion databases",
    args: [{ name: "databaseId", label: "Database link", kind: "text", placeholder: "https://www.notion.so/…", hint: "Open the database as a full page and paste its link." }],
    defaults: { databaseId: "" },
    fields: [{ name: "rows", label: "Rows", kind: "list" }],
    toArgs: (a) => ({ ...a, databaseId: notionIdOf(a.databaseId ?? "") }),
  },
  {
    tool: "googlecalendar_find_free_time",
    title: "Find free time",
    // No fields: the engine's tool takes numbers and a job's arguments are text, so it runs with
    // its own defaults (gaps of an hour or more, 09:00 to 18:00 on the owner's clock).
    line: "Free hours in your calendar, 09:00 to 18:00",
    args: [],
    fields: [{ name: "slots", label: "Free slots", kind: "list" }],
  },
  {
    tool: "zoom_list_meetings",
    title: "List Zoom meetings",
    line: "Your upcoming Zoom meetings",
    args: [],
    fields: [{ name: "meetings", label: "Zoom meetings", kind: "list" }],
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
