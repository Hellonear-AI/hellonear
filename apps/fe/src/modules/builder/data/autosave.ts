// Unsaved Builder changes, kept on this device while you edit (Ancung, 9 Nov: "autosave draft").
// Not saved to the engine: a job may be on a schedule, and half-done edits must not run at 08:00.
// One slot per Mind and job ("new" for a job not saved yet). Storage can be blocked or cleared,
// so every read and write is wrapped; the Builder works the same without it.

import type { Draft } from "@/modules/builder/data/draft"

export type KeptDraft = { draft: Draft; at: string }

const key = (mindId: string, workflowId: string | null) => `hellonear.builder.${mindId}.${workflowId ?? "new"}`

export function readDraft(mindId: string, workflowId: string | null): KeptDraft | null {
  try {
    const raw = window.localStorage.getItem(key(mindId, workflowId))
    if (!raw) return null
    const kept = JSON.parse(raw) as KeptDraft
    return kept && kept.draft && Array.isArray(kept.draft.steps) && typeof kept.at === "string" ? kept : null
  } catch {
    return null
  }
}

export function keepDraft(mindId: string, workflowId: string | null, draft: Draft, now = new Date()) {
  try {
    window.localStorage.setItem(key(mindId, workflowId), JSON.stringify({ draft, at: now.toISOString() } satisfies KeptDraft))
  } catch {
    // Blocked storage: nothing is kept, Save still works.
  }
}

export function dropDraft(mindId: string, workflowId: string | null) {
  try {
    window.localStorage.removeItem(key(mindId, workflowId))
  } catch {
    // nothing to do
  }
}
