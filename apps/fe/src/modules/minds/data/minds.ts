// What the shell and screens show about a Mind. Built from the backend in hooks/useMinds.ts
// (GET /v1/minds, each Mind's wallet, approvals and threads; docs/api-contract.md §7).

/** The three starter templates (engine/templates). Other ids fall back to General Assistant visuals. */
export type MindTemplate = "general-assistant" | "payments-mind" | "email-manager"

export type Mind = {
  mindId: string
  name: string
  templateId: string
  /** Equipped skill ids (`GET /minds`). */
  skills: string[]
  /**
   * The wallet balance in NEAR; `null` when the Mind has no wallet yet (404 `no_wallet`),
   * `undefined` when the wallet could not be read (e.g. OutLayer down).
   */
  balanceNear: string | null | undefined
}

export type RecentChat = {
  threadId: string
  title: string
  when: string
}

const TEMPLATE_LABEL: Record<MindTemplate, string> = {
  "general-assistant": "General Assistant",
  "payments-mind": "Payments Mind",
  "email-manager": "Email Manager",
}

const TEMPLATE_IMAGE: Record<MindTemplate, string> = {
  "general-assistant": "/minds/general-assistant.jpg",
  "payments-mind": "/minds/payments-mind.jpg",
  "email-manager": "/minds/email-manager.jpg",
}

function isKnown(templateId: string): templateId is MindTemplate {
  return templateId in TEMPLATE_LABEL
}

export function templateLabel(templateId: string): string {
  return isKnown(templateId) ? TEMPLATE_LABEL[templateId] : "Mind"
}

export function templateImage(templateId: string): string {
  return TEMPLATE_IMAGE[isKnown(templateId) ? templateId : "general-assistant"]
}

/**
 * The square crop of the same art (512 x 512, `public/minds/<id>-avatar.jpg`), for round avatars.
 * The full art is 1408 x 768, and next/image picks a width, so a 40 px circle got an 80 x 44
 * image blown up, and the canvas graph squashed it (Ancung, 10 Nov: the avatars looked blurry).
 */
export function templateAvatar(templateId: string): string {
  return templateImage(templateId).replace(/\.jpg$/, "-avatar.jpg")
}

/**
 * A thread title as the sidebar shows it. The engine's titles can carry a stray reasoning tag when
 * the model closes "</think>" without opening it ("Casual Greeting</think>…", Ancung, 9 Nov):
 * keep what follows the last closing tag when there is any, and drop every leftover tag.
 */
export function cleanThreadTitle(title: string | null): string {
  if (!title) return "Earlier chat"
  const parts = title.split(/<\/think>/i)
  const after = parts.at(-1)?.trim()
  const picked = parts.length > 1 && after ? after : parts[0]
  const cleaned = picked.replace(/<\/?think>/gi, "").replace(/\s+/g, " ").trim()
  return cleaned || "Earlier chat"
}
