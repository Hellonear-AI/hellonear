// First chat (design C1.2): the Mind introduces itself and offers three things to try.
// The design only has the Payments Mind's copy; the other two follow its pattern. Nabil reviewed them on 9 Nov (#10):
// a General Assistant starts with Daily planner only (no balance tool), and an Email Manager may send from its
// own address (email-address skill), only never from the owner's Gmail. Unknown templates fall back to the template's own quote and no suggestions.

type Intro = { intro: (limit: string | null) => string; suggestions: string[] }

const INTROS: Record<string, Intro> = {
  "payments-mind": {
    intro: (limit) =>
      `I pay your bills, ${limit ? `up to ${limit} NEAR at a time ` : ""}and only to people you've added, and I ask before I spend a single NEAR. What's first?`,
    suggestions: ["Pay my internet bill", "Who can you pay?", "What's my balance?"],
  },
  "email-manager": {
    intro: () => "I read your inbox, sum it up and save draft replies in Gmail. I never send from your Gmail. What should I look at?",
    suggestions: ["Anything important in my inbox today?", "Draft a reply to my last email", "What's on my calendar?"],
  },
  "general-assistant": {
    intro: () => "I can plan your day and look things up, and I ask before I spend anything. What's first?",
    suggestions: ["Plan my day", "What can you do?", "What's on my calendar this week?"],
  },
}

export function introFor(templateId: string, limit: string | null, fallbackQuote: string | null) {
  const known = INTROS[templateId]
  if (known) return { intro: known.intro(limit), suggestions: known.suggestions }
  return { intro: fallbackQuote ?? "What's first?", suggestions: [] }
}

/**
 * The line under the composer (C1.1, C1.5). Like other AI chats it warns that the Mind can be
 * wrong (Ancung, 10 Nov); payments still wait for the owner, which the approval cards say.
 */
export function composerNote(name: string, frozen: boolean): string {
  return frozen ? `Your wallet is frozen. ${name} can chat, but can't send money.` : `${name} can make mistakes. Check important details before you approve.`
}
