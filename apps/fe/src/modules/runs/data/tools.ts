// Every engine tool the app names, and the words and motion each place uses for it, in one list
// (they were six tables that drifted apart). Add a new tool here.

/**
 * Which thinking orb a step shows while it runs, by what kind of work it is (Ancung, 10 Nov), so
 * the motion says what the Mind is doing. Only the free states of thinking-orbs.
 */
export type StepOrb = "searching" | "connecting" | "composing" | "working" | "solving" | "breathing" | "listening"

export type ToolWords = {
  /** The step row while it runs ("Checking the balance"), also an approval card's title. */
  doing: string
  /** The step row once done ("Checked the balance"). */
  done: string
  /** The orb while it runs; acting on something ("working") when left out. */
  orb?: StepOrb
  /** Its bubble's name in the live view, when it has its own bubble. */
  node?: string
  /** What the live view's card says it does. */
  about?: string
  /** What the owner said yes or no to ("Declining the meeting"), for tools that ask first. */
  thing?: string
}

export const TOOLS: Record<string, ToolWords> = {
  // Reading and looking things up: a scan sweeps a globe.
  get_balance: { doing: "Checking the balance", done: "Checked the balance", orb: "searching" },
  list_payments: { doing: "Looking at past payments", done: "Looked at past payments", orb: "searching" },
  near_view_account: {
    doing: "Looking up a NEAR account",
    done: "Looked up",
    orb: "searching",
    node: "NEAR lookup",
    about: "Looks up NEAR testnet accounts. It can only read.",
  },
  gmail_list_emails: { doing: "Reading your inbox", done: "Read your inbox", orb: "searching" },
  gmail_read_email: { doing: "Reading an email", done: "Read an email", orb: "searching" },
  googlecalendar_list_events: { doing: "Checking your calendar", done: "Checked your calendar", orb: "searching" },
  mail_list: { doing: "Checking its inbox", done: "Checked its inbox", orb: "searching" },
  mail_read: { doing: "Reading an email", done: "Read an email", orb: "searching" },
  skill: { doing: "Picking up a skill", done: "Picked up a skill", orb: "searching" },
  skill_read: { doing: "Picking up a skill", done: "Picked up a skill", orb: "searching" },
  skill_search: {
    doing: "Looking for a skill",
    done: "Looked for a skill",
    orb: "searching",
    node: "Skill search",
    about: "Finds the right skill for a task.",
  },
  // Reaching a website or an API: a constellation wires itself.
  http_request: {
    doing: "Calling a website",
    done: "Called a website",
    orb: "connecting",
    node: "Websites",
    about: "Calls the websites you allowed, with your saved keys kept out of sight.",
  },
  // Writing: an undulating sash.
  gmail_create_draft: { doing: "Saving a draft in Gmail", done: "Saved a draft in Gmail", orb: "composing", thing: "the draft" },
  mail_send: { doing: "Sending an email", done: "Sent an email", orb: "composing", thing: "the email" },
  mail_send_to_owner: { doing: "Sending you an email", done: "Sent you an email", orb: "composing" },
  // Acting on something: particles on orbits.
  send_payment: { doing: "Sending a payment", done: "Sent a payment", orb: "working" },
  googlecalendar_create_event: { doing: "Adding to your calendar", done: "Added to your calendar", orb: "working", thing: "the event" },
  googlecalendar_create_meeting: { doing: "Scheduling a meeting", done: "Scheduled a meeting", orb: "working", thing: "the meeting" },
  googlecalendar_block_time: { doing: "Blocking time in your calendar", done: "Blocked time in your calendar", orb: "working" },
  gmail_organize: { doing: "Tidying your inbox", done: "Tidied your inbox", orb: "working", thing: "the inbox clean-up" },
  // Paid data (#150): the first call gets a price, the second the report.
  buy_data: { doing: "Buying a report", done: "Asked for a report" },
  // Working something out.
  get_time: { doing: "Checking the time", done: "Checked the time", orb: "solving", node: "Clock", about: "Tells the date and time on your clock." },
  add_numbers: { doing: "Adding numbers", done: "Added numbers", orb: "solving", node: "Calculator", about: "Adds numbers exactly instead of guessing." },
  // Mastra's working memory (engine/src/mastra.ts): what the Mind keeps about the owner between chats.
  updateWorkingMemory: { doing: "Updating its memory", done: "Updated its memory", orb: "breathing" },
}

export const toolWords = (tool: string): ToolWords | undefined => TOOLS[tool]
