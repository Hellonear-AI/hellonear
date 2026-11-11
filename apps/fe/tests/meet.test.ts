import { describe, expect, it } from "vitest"
import { approvalDetails, whenText } from "@/modules/runs/data/approvalDetails"
import type { ToolStep } from "@/modules/runs/data/events"
import { stepText } from "@/modules/runs/data/steps"
import { skillLines } from "@/modules/skills/data/skills"

const step = (tool: string, args: unknown, result?: unknown, status: ToolStep["status"] = "awaiting_approval"): ToolStep => ({
  toolCallId: "c1",
  tool,
  status,
  args,
  result,
})

describe("Google Meet (#97)", () => {
  it("writes the meeting time in the owner's words", () => {
    expect(whenText("2026-11-11T14:00:00+07:00", "2026-11-11T15:00:00+07:00", "Asia/Jakarta")).toBe("Wed 11 Nov, 14:00 to 15:00")
    expect(whenText("2026-11-11T23:00:00+07:00", "2026-11-12T01:00:00+07:00", "Asia/Jakarta")).toBe("Wed 11 Nov, 23:00 to Thu 12 Nov, 01:00")
    expect(whenText("not a date", null)).toBeNull()
  })

  it("shows who gets invited and whether there is a Meet link before approving", () => {
    const d = approvalDetails(
      step("googlecalendar_create_meeting", {
        title: "Rapat KKN",
        start: "2026-11-11T14:00:00+07:00",
        end: "2026-11-11T15:00:00+07:00",
        attendees: ["budi@example.com", "sari@example.com"],
        meet: true,
      }),
      "Asia/Jakarta"
    )
    expect(d?.title).toBe('Schedule "Rapat KKN"')
    expect(d?.lines).toEqual([
      { label: "When", value: "Wed 11 Nov, 14:00 to 15:00" },
      { label: "Guests", value: "budi@example.com, sari@example.com" },
      { label: "Video", value: "A Google Meet link" },
    ])
    expect(d?.note).toBe("Adds it to your Google Calendar, and Google emails each guest an invite in your name.")

    const solo = approvalDetails(step("googlecalendar_create_meeting", { title: "Focus", attendees: [], meet: false }))
    expect(solo?.lines).toContainEqual({ label: "Guests", value: "No guests" })
    expect(solo?.lines).toContainEqual({ label: "Video", value: "No video link" })
    expect(solo?.note).toBe("Adds it to your Google Calendar.")
  })

  it("gives events and the Mind's own email a readable card too, and leaves payments alone", () => {
    expect(approvalDetails(step("googlecalendar_create_event", { title: "Gym" }))?.title).toBe('Add "Gym" to your calendar')
    expect(approvalDetails(step("mail_send", { to: ["a@b.co"], subject: "Hi" }))?.lines).toEqual([{ label: "To", value: "a@b.co" }])
    expect(approvalDetails(step("send_payment", { to: "x.testnet", amountNear: "1" }))).toBeNull()
  })

  it("names the step and how many guests were invited", () => {
    expect(stepText(step("googlecalendar_create_meeting", {}, undefined, "running")).label).toBe("Scheduling a meeting...")
    const done = stepText(step("googlecalendar_create_meeting", {}, { title: "Rapat KKN", attendees: ["a@b.co"], meetLink: "https://meet.google.com/x" }, "ok"))
    expect(done).toMatchObject({ label: "Scheduled a meeting", detail: "Rapat KKN, 1 guest invited" })
  })

  it("lists Google Meet on Daily planner, with its real status or the try-out's sample", () => {
    const ctx = { name: "Omaga", limit: null }
    expect(skillLines("daily-planner", { ...ctx, apps: { googlecalendar: "connected" } })).toContainEqual({
      t: "Your Google Meet, not connected",
      tone: "off",
      connect: "googlemeet",
    })
    expect(skillLines("daily-planner", { ...ctx, tryOut: true }).map((l) => l.t)).toContain("A sample Meet link for the try-out")
  })
})

describe("answer toasts for things that aren't payments", () => {
  const view = (status: ToolStep["status"]) => ({
    tools: [step("googlecalendar_create_meeting", { title: "Rapat KKN" }, { title: "Rapat KKN" }, status)],
  })
  const answer = (action: "approve" | "decline") => ({ runId: "r1", toolCallId: "c1", action, tool: "googlecalendar_create_meeting", args: {} })

  it("names the thing, not the tool's progress words", async () => {
    const { answerOutcome } = await import("@/modules/chat/data/answer")
    const run = (status: ToolStep["status"], streaming = false) => ({ view: view(status) as never, streaming, failed: null })
    expect(answerOutcome(answer("decline"), run("awaiting_approval", true)).title).toBe("Declining the meeting")
    expect(answerOutcome(answer("approve"), run("awaiting_approval", true)).title).toBe("Approving the meeting")
    expect(answerOutcome(answer("approve"), run("ok"))).toMatchObject({ kind: "sent", title: "Scheduled a meeting" })
    expect(answerOutcome(answer("decline"), run("declined"))).toMatchObject({ title: "Declined the meeting", detail: "No changes were made." })
  })
})

describe("Tidying the inbox (#106)", () => {
  const emails = [{ messageId: "a", from: "The Weekly Byte <newsletter@weeklybyte.example>", subject: "Issue 42" }, { messageId: "b", from: "StreamBox", subject: "Your receipt" }]
  it("lists every email on the approval card and says nothing is deleted", () => {
    const d = approvalDetails(step("gmail_organize", { action: "archive", emails }))!
    expect(d.title).toBe("Archive 2 emails")
    expect(d.lines).toEqual([{ label: "1", value: "The Weekly Byte: Issue 42" }, { label: "2", value: "StreamBox: Your receipt" }])
    expect(d.note).toMatch(/Nothing is deleted/)
    expect(approvalDetails(step("gmail_organize", { action: "label", label: "Later", emails: emails.slice(0, 1) }))!.title).toBe('Label 1 email "Later"')
  })
  it("says what was done, and that a sample inbox never changes", () => {
    expect(stepText(step("gmail_organize", {}, { source: "gmail", action: "archive", done: 2, failed: [] }, "ok")).detail).toBe("2 archived")
    expect(stepText(step("gmail_organize", {}, { source: "gmail", action: "label_and_archive", label: "News", done: 1, failed: [{ messageId: "b" }] }, "ok")).detail).toBe("1 labelled News and archived, 1 failed")
    expect(stepText(step("gmail_organize", {}, { source: "sample_inbox", action: "archive", done: 2, failed: [] }, "ok")).detail).toBe("sample inbox, nothing changed")
  })
})

describe("approval cards for the track skills' apps (#211)", () => {
  it("says what goes where for Slack, Sheets and a sale", async () => {
    const { approvalDetails } = await import("@/modules/runs/data/approvalDetails")
    const step = (tool: string, args: unknown) => ({ toolCallId: "t", tool, status: "awaiting_approval" as const, args, result: undefined })
    expect(approvalDetails(step("slack_send_message", { channel: "finance", text: "Paid." }))).toMatchObject({ title: "Post to #finance", lines: [{ label: "Message", value: "Paid." }] })
    expect(approvalDetails(step("googlesheets_append_row", { sheet: "Expenses", values: ["Hosting", 50000] }))?.lines[0].value).toBe("Hosting, 50000")
    expect(approvalDetails(step("sell_offer", { title: "Weekly digest", priceNear: "0.5", item: "weekly-digest" }))?.title).toBe('Sell "Weekly digest" for 0.5 NEAR')
  })
})

describe("Sheets cell change card (#245)", () => {
  it("shows the cells now and the new value", async () => {
    const { approvalDetails } = await import("@/modules/runs/data/approvalDetails")
    const d = approvalDetails({ toolCallId: "c", tool: "googlesheets_update_cells", status: "awaiting_approval", args: { spreadsheetId: "s", range: "Invoices!D3", newValues: [["Paid"]], oldValues: [["Unpaid"]] }, result: undefined })
    expect(d?.title).toBe("Change Invoices!D3 in your Google Sheet")
    expect(d?.lines).toEqual([{ label: "Now", value: "Unpaid" }, { label: "New", value: "Paid" }])
    const blank = approvalDetails({ toolCallId: "c", tool: "googlesheets_update_cells", status: "awaiting_approval", args: { range: "A!B2:C2", newValues: [["x", 2]], oldValues: [["", null]] }, result: undefined })
    expect(blank?.lines[0]).toEqual({ label: "Now", value: "(empty), (empty)" })
  })
})
