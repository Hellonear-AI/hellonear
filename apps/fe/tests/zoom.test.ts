import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { approvalDetails } from "@/modules/runs/data/approvalDetails"
import { toolWords } from "@/modules/runs/data/tools"
import { ACTION_RULES } from "@/modules/settings/data/autoApprove"
import { appInfo } from "@/modules/connections/data/apps"
import { nodeIdFor } from "@/modules/graph/data/graph"
import { categoryOf } from "@/modules/skills/data/categories"
import { SKILLS, skillCopy } from "@/modules/skills/data/skills"

const step = (args: unknown) => ({ toolCallId: "t", tool: "zoom_create_meeting", status: "awaiting_approval" as const, args, result: undefined })

describe("Zoom (#246)", () => {
  it("the approval card shows the time on the owner's clock, the length and that nobody is invited, in the backend's words", () => {
    expect(approvalDetails(step({ topic: "Launch review", start: "2026-11-12T10:00:00+07:00", minutes: 30 }), "Asia/Jakarta")).toEqual({
      title: 'Schedule the Zoom meeting "Launch review"',
      lines: [
        { label: "When", value: "Thu 12 Nov, 10:00 to 10:30" },
        { label: "Length", value: "30 minutes" },
        { label: "Guests", value: "Nobody is invited" },
      ],
      note: "Creates the meeting in your Zoom with a join link. Nobody is emailed; share the link yourself.",
    })
    // The same words as apps/be/src/approvals.ts (Telegram).
    const be = readFileSync(join(__dirname, "../../be/src/approvals.ts"), "utf8")
    expect(be).toContain("Schedule the Zoom meeting")
    expect(be).toContain("Creates the meeting in your Zoom with a join link. Nobody is emailed; share the link yourself.")
  })

  it("has tool words, a rule switch, a Connections entry, a skill card and an app bubble", () => {
    for (const t of ["zoom_list_meetings", "zoom_create_meeting", "zoom_meeting_summary"]) expect(toolWords(t)?.doing).toBeTruthy()
    expect(toolWords("zoom_create_meeting")?.thing).toBe("the Zoom meeting")
    expect(ACTION_RULES.map((r) => r.tool)).toContain("zoom_create_meeting")
    expect(appInfo("zoom")?.by).toBe("Zoom")
    expect(SKILLS.zoom.needs).toBe("zoom")
    expect(skillCopy("zoom").title).toBe("Zoom")
    expect(categoryOf("zoom")).toBe("apps")
    expect(nodeIdFor("m1", "zoom_meeting_summary")).toBe("app:zoom")
  })

  it("the rule list matches the engine's and the backend's", () => {
    const engine = readFileSync(join(__dirname, "../../../engine/src/autoApprove.ts"), "utf8")
    const be = readFileSync(join(__dirname, "../../be/src/minds.ts"), "utf8")
    expect(engine).toContain("'zoom_create_meeting'")
    expect(be).toContain("'zoom_create_meeting'")
  })
})
