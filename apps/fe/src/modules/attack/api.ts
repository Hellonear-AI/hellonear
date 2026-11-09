import { api, ApiError } from "@/lib/api"
import { ownerTimeZone, stream } from "@/modules/chat/api"
import type { RunEvent } from "@/modules/chat/data/events"

// Attack Playground (#16). The engine side is docs/api-contract.md §2 (`GET /v1/attacks`, `attackId`
// on a run, `attack.verdict` in §3). The backend routes are asked for in #129: until they exist,
// `list` answers null and the screen says so.

export type ApiAttack = {
  attackId: string
  title: string
  description: string
  templateId: string
  skills: string[]
  attacker: string
  message: string
}

const enc = encodeURIComponent

export const attackApi = {
  /** The fixed scenarios, or null while the backend has no Attack Playground routes (404). */
  list: async (): Promise<ApiAttack[] | null> => {
    try {
      return (await api<{ attacks: ApiAttack[] }>("/attacks")).attacks
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },
  /** Runs one attack on its own playground Mind and the shared demo wallet; SSE of §3 events. */
  run: (attackId: string, onEvent: (e: RunEvent) => void, signal?: AbortSignal) =>
    stream(`/attacks/${enc(attackId)}/runs`, { ...ownerTimeZone() }, onEvent, signal),
  /** The owner's answer on the playground's payment card, with the attack it belongs to. */
  answer: (
    runId: string,
    action: "approve" | "decline",
    body: { toolCallId: string; attackId: string },
    onEvent: (e: RunEvent) => void,
    signal?: AbortSignal
  ) => stream(`/runs/${enc(runId)}/${action}`, { ...body, ...ownerTimeZone() }, onEvent, signal),
}
