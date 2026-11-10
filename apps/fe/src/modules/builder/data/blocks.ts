// The kinds of block the Builder can add, and the one place their icon, colour and words live:
// the Blocks panel, a way's "Add a step" panel, "Add a block" on phones, the canvas cards and the
// settings panels all read them from here.

import { BotIcon, CalendarClockIcon, GitBranchIcon, GlobeIcon, OctagonXIcon, SearchIcon, type LucideIcon } from "lucide-react"
import { comparable, resultsOf, stepsAt, type Block, type Self, type Step } from "@/modules/builder/data/draft"
import type { Place } from "@/modules/builder/data/places"
import type { Tone } from "@/modules/builder/data/tone"
import { TOOLS } from "@/modules/builder/data/tools"

/** A block the palette or a slot can add. */
export type Kind = "agent" | "tool" | "http" | "if" | "end"

type Meta = {
  tone: Tone
  Icon: LucideIcon
  /** The block's name; an Ask step is named after the Mind. */
  title: (mind: string) => string
  /** The line under it in the Blocks panel. */
  line: (mind: string) => string
  /** The longer line under it in "Add a block" on phones. */
  long: (mind: string) => string
}

export const KIND_META: Record<Kind | "start", Meta> = {
  start: { tone: "start", Icon: CalendarClockIcon, title: () => "Start", line: () => "Every job has one", long: () => "Every job has one" },
  agent: { tone: "agent", Icon: BotIcon, title: (mind) => `Ask ${mind}`, line: (mind) => `${mind} writes or decides`, long: (mind) => `${mind} writes or decides something` },
  tool: {
    tone: "tool",
    Icon: SearchIcon,
    title: () => "Use a tool",
    line: () => "An account, the time, the calendar, the inbox",
    long: () => "An account, the time, the calendar, the inbox",
  },
  http: { tone: "http", Icon: GlobeIcon, title: () => "Call a website", line: () => "Send to your own service", long: () => "Send something to your own service" },
  if: { tone: "if", Icon: GitBranchIcon, title: () => "If or else", line: () => "Choose one of two ways", long: () => "Choose one of two ways" },
  // End (#164): the path stops where you put it.
  end: { tone: "start", Icon: OctagonXIcon, title: () => "End", line: () => "Stop the job here", long: () => "Stop the job on this path" },
}

/** The order blocks are offered in when adding at a place (a way's panel, "Add a block"). */
export const ADD_KINDS: Kind[] = ["agent", "tool", "http", "if", "end"]
/** The Blocks panel's order: Start first (every job has one), then what can be added. */
export const PALETTE_KINDS: (Kind | "start")[] = ["start", "agent", "tool", "if", "http", "end"]

/** Why a block can't go at a place, in the lists that add at a place. */
export const WHY_NOT: Record<Kind, string> = {
  agent: "The path already ends above",
  tool: "The path already ends above",
  http: "The path already ends above",
  if: "Add a check or a website before it",
  end: "Only at the end of a path",
}
/** The Blocks panel's shorter words for the same, where it adds at the end of the main line. */
export const PALETTE_WHY_NOT: Partial<Record<Kind, string>> = { if: "Add a check or a website first", end: "Goes at the end of a path" }

let counter = 0
export const newId = (kind: string) => `${kind}-${Date.now().toString(36)}${counter++}`

function newStep(kind: "agent" | "tool" | "http", address: string): Step {
  const id = newId(kind === "agent" ? "ask" : kind)
  return kind === "agent"
    ? { id, kind, prompt: "" }
    : kind === "http"
      ? { id, kind, method: "GET", url: "https://", key: "", body: "" }
      : { id, kind, tool: TOOLS[0].tool, args: { accountId: address } }
}

/** A new block of `kind` for a place; an If starts on the first value it can compare there. */
export function newBlock(kind: Kind, line: Block[], at: Place, self: Self, address: string): Block {
  if (kind === "if") {
    const first = resultsOf(stepsAt(line, at.path, at.index), self).find(comparable)
    return { id: newId("check"), kind: "if", stepId: first?.stepId ?? "", field: first?.name ?? "", op: first?.kind === "number" ? "lt" : "eq", right: "", then: [], else: [] }
  }
  if (kind === "end") return { id: newId("end"), kind: "end" }
  return newStep(kind, address)
}
