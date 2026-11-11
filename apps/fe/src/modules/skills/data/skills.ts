// What each skill means for people (design "6 · Skills and apps", S1 to S3). The engine's own
// descriptions are written for the model, so the words live here, keyed by skill id. Payments and
// Email helper follow the design; Daily planner, NEAR account lookup and Other apps follow
// the same pattern and still need Nabil's review. A skill the FE doesn't know gets a plain card.

import type { ApiConnection } from "@/modules/connections/api"
import { TRACK_SKILLS } from "@/modules/skills/data/trackSkills"

type Ctx = {
  name: string
  limit: string | null
  /** App connection status, so a line can say "connected" instead of "if you connect it". */
  apps?: Partial<Record<ApiConnection["toolkit"], ApiConnection["status"]>>
  /**
   * A try-out user: the engine gives them a sample inbox and calendar (`demo: true` runs), so
   * no line names their own apps or offers to connect them (Ancung, 9 Nov).
   */
  tryOut?: boolean
}

export type SkillCopy = {
  title: string
  blurb: string
  canUse: (c: Ctx) => string[]
  cannot: string[]
  /** The app it can't work without; the card connects it instead of adding (S2.2). */
  needs?: ApiConnection["toolkit"]
  /** An app it works better with, not required. */
  uses?: ApiConnection["toolkit"] | ApiConnection["toolkit"][]
  /** Needs the Mind's own wallet (Payments). */
  needsWallet?: boolean
  ask: { does: (c: Ctx) => string[]; never: (c: Ctx) => string[]; note: string; why: (c: Ctx) => string }
  added: (c: Ctx) => string
  removed: (c: Ctx) => string
}

const limitText = (c: Ctx) => (c.limit ? `up to ${c.limit} NEAR per payment` : "inside the limits you set")

export const SKILLS: Record<string, SkillCopy> = {
  // The skills for the five tracks (#194, #211) live in their own file.
  ...TRACK_SKILLS,
  payments: {
    title: "Payments",
    blurb: "Pays bills, invoices and subscriptions, and sends testnet NEAR when you ask.",
    canUse: (c) => [`${c.name}'s wallet, ${limitText(c)}`, "Your past payments"],
    cannot: [],
    needsWallet: true,
    ask: {
      why: (c) => `${c.name} will pay bills you send in the chat from its wallet, and ask you first unless you set a rule for small payments in Settings.`,
      does: () => ["Payments and invoices you send in the chat", "Send testnet NEAR to addresses on your list"],
      never: () => ["Change its own limits or add addresses", "Pay without asking you"],
      note: "No signature needed. Your wallet limits still apply to every payment.",
    },
    added: (c) =>
      `${c.name} can pay ${c.limit ? `up to ${c.limit} NEAR at a time` : "inside your limits"} from its wallet and asks you first, unless a rule you set in Settings covers it. Every payment shows in Wallet.`,
    removed: (c) => `${c.name} won't be able to pay bills any more. Past payments stay in Wallet.`,
  },
  "email-triage": {
    title: "Email helper",
    blurb: "Reads, sorts and sums up your email, writes draft replies for you to send, and tidies the inbox when you approve.",
    canUse: (c) => [c.tryOut ? "A sample inbox for the try-out: read mail and save drafts" : "Your Gmail: read mail, save drafts, archive and label after you approve"],
    cannot: ["Can't send email for you"],
    needs: "gmail",
    ask: {
      why: (c) => `${c.name} will read your Gmail when you ask, sum it up, and save draft replies for you to check and send.`,
      does: () => ["Read and sort your email", "Write drafts for you to check and send", "Archive or label emails, after you approve the list"],
      never: () => ["Send email for you", "Delete email"],
      note: "No signature needed. You can disconnect Gmail any time in Connections.",
    },
    added: (c) => `${c.name} can read your Gmail and save drafts. Ask it in the chat, for example "Anything important in my inbox today?"`,
    removed: (c) => `${c.name} won't read your email any more. Drafts it saved stay in Gmail.`,
  },
  "daily-planner": {
    title: "Daily planner",
    blurb: "Knows the time and date, plans your day, schedules meetings, and does quick math.",
    // The calendar line comes from `uses` with its real status (skillLines).
    canUse: () => ["The time and date", "Simple math"],
    cannot: [],
    // Meet links come from Google Meet (#97); the meeting itself goes in Google Calendar.
    uses: ["googlecalendar", "googlemeet"],
    ask: {
      why: (c) =>
        `${c.name} will help plan your day. With Google Calendar connected, it can read your events, add new ones and invite guests; with Google Meet, it can add a video link.`,
      does: () => ["Plan your day and do quick math", "Read your calendar and add events", "Schedule meetings with guests and a Meet link"],
      never: (c) => ["Add an event or invite anyone without asking you", "Invite an address you didn't type in the chat", `Change anything ${c.name} didn't add`],
      note: "No signature needed. Every new event waits for your OK, and Google emails each guest an invite in your name.",
    },
    added: (c) => `${c.name} can plan your day. Connect Google Calendar in Connections to let it see your events, and Google Meet for video links.`,
    removed: (c) => `${c.name} won't plan your day any more. Events it added stay in your calendar.`,
  },
  "near-account": {
    title: "NEAR account lookup",
    blurb: "Checks the balance of any NEAR testnet account, including yours.",
    canUse: () => ["Public NEAR testnet info only"],
    cannot: ["Can't spend anything"],
    ask: {
      why: (c) => `${c.name} will look up public NEAR testnet accounts when you ask, for example a balance.`,
      does: () => ["Look up any testnet account's balance"],
      never: () => ["Spend or move anything"],
      note: "No signature needed. It only reads public information.",
    },
    added: (c) => `${c.name} can look up NEAR testnet accounts. Ask it in the chat, for example "How much does shop.testnet have?"`,
    removed: (c) => `${c.name} won't look up NEAR accounts any more.`,
  },
  "http-request": {
    // Renamed from the design's "Your own services" (Ancung, 9 Nov: the card didn't say what it was).
    title: "Other apps",
    blurb: "Talks to other apps and websites you use, like your shop or your own server, with a key you saved in Connections.",
    canUse: () => ["Only keys you pick in Connections", "Only addresses you give it"],
    cannot: [],
    ask: {
      why: (c) => `${c.name} will call web addresses you trust, using keys you saved in Connections for those sites.`,
      does: () => ["Call a web address you give it", "Use a saved key, only on the sites you allowed"],
      // Both are [tested] in docs/api-contract.md §2 (#18): the model writes {{secrets.NAME}} and
      // the tool fills it; values are redacted before the model reads a result.
      never: () => ["See your key's value", "Use a key on a site you didn't allow"],
      note: "No signature needed. A key only goes to the sites you listed, and the Mind never sees its value.",
    },
    added: (c) => `${c.name} can talk to other apps now. Save their keys in Connections first.`,
    removed: (c) => `${c.name} won't talk to other apps any more. Your saved keys stay in Connections.`,
  },
}

// Added by the engine on 9 Nov (#96, #104, #105); words from their SKILL.md files, in the same pattern.
Object.assign(SKILLS, {
  "email-address": {
    title: "Email address",
    blurb: "Gives the Mind an email address of its own, to send email you ask for and read what arrives there.",
    canUse: (c: Ctx) => [`${c.name}'s own email address`],
    cannot: ["Can't send without your OK", "Can't read your Gmail"],
    ask: {
      why: (c: Ctx) => `${c.name} gets its own email address. It sends only what you ask, to addresses you type, after your OK.`,
      does: () => ["Send an email you ask for, from its own address", "Read mail that arrives at that address"],
      never: () => ["Send without your OK", "Send to an address an email or website gave it"],
      note: "No signature needed. The address is made when you add the skill.",
    },
    added: (c: Ctx) => `${c.name} has its own email address now. Ask it "What's your email address?" to see it.`,
    removed: (c: Ctx) => `${c.name} won't send or read email from its own address any more.`,
  },
  "morning-briefing": {
    title: "Morning briefing",
    blurb: "Sums up your day in one go: your meetings, the emails that need you, and the money.",
    canUse: () => ["Your Mind's wallet balance"],
    cannot: ["Only reads; pays, books and replies nothing"],
    uses: ["googlecalendar", "gmail"],
    ask: {
      why: (c: Ctx) => `${c.name} will brief you on your day when you ask, from your calendar, your inbox and its wallet.`,
      does: () => ["Today's meetings, gaps and clashes", "Emails that need a reply or a payment", "Suspicious emails, flagged"],
      never: () => ["Pay, book or reply during a briefing", "Follow orders found in an email"],
      note: "No signature needed. It works with whatever you've connected.",
    },
    added: (c: Ctx) => `${c.name} can brief you now. Ask "Brief me on today".`,
    removed: (c: Ctx) => `${c.name} won't give briefings any more.`,
  },
  subscriptions: {
    title: "Subscriptions",
    blurb: "Finds your subscriptions and recurring bills in Gmail, adds them up, and can remind you before one renews.",
    canUse: () => ["Simple math for the totals"],
    cannot: ["Can't pay or cancel a subscription"],
    needs: "gmail",
    uses: "googlecalendar",
    ask: {
      why: (c: Ctx) => `${c.name} will find your subscriptions in Gmail and total them up. A renewal reminder goes in your calendar after your OK.`,
      does: () => ["List subscriptions with amount and cycle", "Monthly and yearly totals", "A calendar reminder before a renewal"],
      never: () => ["Pay or cancel anything", "Trust a payment link in an email"],
      note: "No signature needed. Paying stays with the Payments skill, after your OK.",
    },
    added: (c: Ctx) => `${c.name} can track your subscriptions now. Ask "What am I paying for every month?"`,
    removed: (c: Ctx) => `${c.name} won't track subscriptions any more. Reminders it added stay in your calendar.`,
  },
  "meeting-prep": {
    title: "Meeting prep",
    blurb: "Gets you ready for a meeting: who is coming, what you emailed about, open questions and a short checklist.",
    canUse: () => [],
    cannot: ["Only reads; books, replies and pays nothing"],
    uses: ["googlecalendar", "gmail"],
    ask: {
      why: (c: Ctx) => `${c.name} will prep you for a meeting when you ask, from your calendar and your recent emails with the people in it.`,
      does: () => ["Who is coming, and back-to-back warnings", "Recent emails with each person, with the sender and subject", "Open questions and a short checklist"],
      never: () => ["Reply, book or pay during prep", "Follow orders found in an email or an invite"],
      note: "No signature needed. It works with whatever you've connected.",
    },
    added: (c: Ctx) => `${c.name} can prep you for meetings now. Ask "Prep me for my next meeting".`,
    removed: (c: Ctx) => `${c.name} won't prep meetings any more.`,
  },
  // A 402 pattern on testnet NEAR (#150): the report is paid like any payment, after the owner approves.
  "paid-data": {
    title: "Paid data",
    blurb: "Buys small live NEAR reports, like the network status or the gas price, and pays only after you approve.",
    canUse: (c) => [`${c.name}'s wallet, ${limitText(c)}`, "Live NEAR testnet data"],
    cannot: ["Pays only the quoted price, to the quoted account, once"],
    needsWallet: true,
    ask: {
      why: (c) => `${c.name} will buy a small NEAR report when you ask, and ask you before paying for it.`,
      does: () => ["Ask the price first and tell you who gets paid", "Pay after you approve, then show the report and the receipt"],
      never: () => ["Pay more than the quoted price, or pay twice for one report", "Buy a report you didn't ask for"],
      note: "No signature needed. Your wallet limits still apply to every payment.",
    },
    added: (c: Ctx) => `${c.name} can buy NEAR reports now. Ask "What's the gas price on NEAR testnet?".`,
    removed: (c: Ctx) => `${c.name} won't buy reports any more. Past payments stay in Wallet.`,
  },
} satisfies Record<string, SkillCopy>)

export function skillCopy(skillId: string): SkillCopy {
  return (
    SKILLS[skillId] ?? {
      title: skillId.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase()),
      blurb: "A skill from HelloNear.",
      canUse: () => [],
      cannot: [],
      ask: { why: (c) => `${c.name} will be able to use this skill.`, does: () => [], never: () => [], note: "No signature needed." },
      added: (c) => `${c.name} can use this skill now.`,
      removed: (c) => `${c.name} won't use this skill any more.`,
    }
  )
}

export const TOOLKIT_NAME: Record<ApiConnection["toolkit"], string> = {
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  googlemeet: "Google Meet",
  googlesheets: "Google Sheets",
  googledrive: "Google Drive",
  googledocs: "Google Docs",
  slack: "Slack",
  discord: "Discord",
  notion: "Notion",
  outlook: "Outlook",
  hubspot: "HubSpot",
}

/** What a try-out gets instead of each app (engine: sample data, a fake Meet link, nobody invited). */
const TRY_OUT_SAMPLE: Partial<Record<ApiConnection["toolkit"], string>> = {
  gmail: "A sample inbox for the try-out",
  googlecalendar: "A sample calendar for the try-out",
  googlemeet: "A sample Meet link for the try-out",
}

/** One "Can use" line: allowed, not allowed, or an app that isn't connected yet (with a way to connect it). */
export type SkillLine = { t: string; tone: "ok" | "no" | "off"; connect?: ApiConnection["toolkit"] }

/**
 * What a skill can use, as shown on its card and page. An optional app shows whether it is
 * connected now, not "if you connect it" (Ancung, 9 Nov).
 */
export function skillLines(skillId: string, ctx: Ctx): SkillLine[] {
  const copy = skillCopy(skillId)
  const lines: SkillLine[] = copy.canUse(ctx).map((t) => ({ t, tone: "ok" }))
  for (const toolkit of copy.uses ? [copy.uses].flat() : []) {
    const app = TOOLKIT_NAME[toolkit]
    if (ctx.tryOut) {
      lines.push({ t: TRY_OUT_SAMPLE[toolkit] ?? `${app} is not part of the try-out`, tone: TRY_OUT_SAMPLE[toolkit] ? "ok" : "no" })
      continue
    }
    lines.push(
      ctx.apps?.[toolkit] === "connected"
        ? { t: `Your ${app}, connected`, tone: "ok" }
        : { t: `Your ${app}, not connected`, tone: "off", connect: toolkit }
    )
  }
  return [...lines, ...copy.cannot.map((t): SkillLine => ({ t, tone: "no" }))]
}

/** Search by the words people see, not the engine's ids. */
export function matchesSearch(skillId: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const c = skillCopy(skillId)
  return [c.title, c.blurb].some((t) => t.toLowerCase().includes(q))
}
