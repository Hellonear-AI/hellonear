// Sample data until the backend routes are wired (GET /v1/minds, approvals, threads #54).
// Shapes follow docs/api-contract.md where a route exists; nothing here is real.

export type MindTemplate = "general-assistant" | "payments-mind" | "email-manager"

export type Mind = {
  mindId: string
  name: string
  templateId: MindTemplate
  /** null when the Mind has no wallet yet (GET …/wallet answers 404 no_wallet). */
  balanceNear: string | null
}

export type RecentChat = {
  threadId: string
  title: string
  when: string
}

export const TEMPLATE_LABEL: Record<MindTemplate, string> = {
  "general-assistant": "General Assistant",
  "payments-mind": "Payments Mind",
  "email-manager": "Email Manager",
}

export const TEMPLATE_IMAGE: Record<MindTemplate, string> = {
  "general-assistant": "/minds/general-assistant.jpg",
  "payments-mind": "/minds/payments-mind.jpg",
  "email-manager": "/minds/email-manager.jpg",
}

export const SAMPLE_MINDS: Mind[] = [
  { mindId: "penny", name: "Penny", templateId: "payments-mind", balanceNear: "42.00" },
  { mindId: "ava", name: "Ava", templateId: "general-assistant", balanceNear: null },
]

export const SAMPLE_RECENT_CHATS: Record<string, RecentChat[]> = {
  penny: [
    { threadId: "t-internet", title: "Internet bill for November", when: "Today" },
    { threadId: "t-rent", title: "Rent to landlord", when: "Yesterday" },
    { threadId: "t-spend", title: "What did I spend this week?", when: "Mon" },
  ],
  ava: [],
}

export const SAMPLE_APPROVALS: Record<string, number> = { penny: 2, ava: 0 }
