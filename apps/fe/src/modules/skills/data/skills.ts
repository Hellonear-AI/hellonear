// What each skill means for people (design "6 · Skills and apps", S1 to S3). The engine's own
// descriptions are written for the model, so the words live here, keyed by skill id. Payments and
// Email helper follow the design; Daily planner, NEAR account lookup and Your own services follow
// the same pattern and still need Nabil's review. A skill the FE doesn't know gets a plain card.

import type { ApiConnection } from "@/modules/minds/api"

type Ctx = { name: string; limit: string | null }

export type SkillCopy = {
  title: string
  blurb: string
  canUse: (c: Ctx) => string[]
  cannot: string[]
  /** The app it can't work without; the card connects it instead of adding (S2.2). */
  needs?: ApiConnection["toolkit"]
  /** An app it works better with, not required. */
  uses?: ApiConnection["toolkit"]
  /** Needs the Mind's own wallet (Payments). */
  needsWallet?: boolean
  ask: { does: (c: Ctx) => string[]; never: (c: Ctx) => string[]; note: string; why: (c: Ctx) => string }
  added: (c: Ctx) => string
  removed: (c: Ctx) => string
}

const limitText = (c: Ctx) => (c.limit ? `up to ${c.limit} NEAR per payment` : "inside the limits you set")

export const SKILLS: Record<string, SkillCopy> = {
  payments: {
    title: "Payments",
    blurb: "Pays bills, invoices and subscriptions, and sends testnet NEAR when you ask.",
    canUse: (c) => [`${c.name}'s wallet, ${limitText(c)}`, "Your past payments"],
    cannot: [],
    needsWallet: true,
    ask: {
      why: (c) => `${c.name} will pay bills you send in the chat from its wallet, and ask you before every payment.`,
      does: () => ["Payments and invoices you send in the chat", "Send testnet NEAR to addresses on your list"],
      never: () => ["Change its own limits or add addresses", "Pay without asking you"],
      note: "No signature needed. Your wallet limits still apply to every payment.",
    },
    added: (c) =>
      `${c.name} can pay ${c.limit ? `up to ${c.limit} NEAR at a time` : "inside your limits"} from its wallet and asks you before every payment. Every payment shows in Wallet.`,
    removed: (c) => `${c.name} won't be able to pay bills any more. Past payments stay in Wallet.`,
  },
  "email-triage": {
    title: "Email helper",
    blurb: "Reads, sorts and sums up your email, and writes draft replies for you to send.",
    canUse: () => ["Your Gmail: read mail and save drafts"],
    cannot: ["Can't send email for you"],
    needs: "gmail",
    ask: {
      why: (c) => `${c.name} will read your Gmail when you ask, sum it up, and save draft replies for you to check and send.`,
      does: () => ["Read and sort your email", "Write drafts for you to check and send"],
      never: () => ["Send email for you", "Delete email"],
      note: "No signature needed. You can disconnect Gmail any time in Connections.",
    },
    added: (c) => `${c.name} can read your Gmail and save drafts. Ask it in the chat, for example "Anything important in my inbox today?"`,
    removed: (c) => `${c.name} won't read your email any more. Drafts it saved stay in Gmail.`,
  },
  "daily-planner": {
    title: "Daily planner",
    blurb: "Knows the time and date, plans your day, and does quick math.",
    canUse: () => ["The time and date", "Simple math", "Your Google Calendar, if you connect it"],
    cannot: [],
    uses: "googlecalendar",
    ask: {
      why: (c) => `${c.name} will help plan your day. With Google Calendar connected, it can read your events and add new ones.`,
      does: () => ["Plan your day and do quick math", "Read your calendar and add events, if you connect it"],
      never: (c) => [`Add an event without asking you`, `Change anything ${c.name} didn't add`],
      note: "No signature needed. Every new event waits for your OK.",
    },
    added: (c) => `${c.name} can plan your day. Connect Google Calendar in Connections to let it see your events.`,
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
    title: "Your own services",
    blurb: "Calls a web address you trust, using a key you saved in Connections.",
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
    added: (c) => `${c.name} can call your own services. Save their keys in Connections first.`,
    removed: (c) => `${c.name} won't call your services any more. Your saved keys stay in Connections.`,
  },
}

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

export const TOOLKIT_NAME: Record<ApiConnection["toolkit"], string> = { gmail: "Gmail", googlecalendar: "Google Calendar" }

/** Search by the words people see, not the engine's ids. */
export function matchesSearch(skillId: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const c = skillCopy(skillId)
  return [c.title, c.blurb].some((t) => t.toLowerCase().includes(q))
}
