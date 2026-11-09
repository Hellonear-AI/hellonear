import { afterEach, describe, expect, it, vi } from "vitest"
import { compareNear } from "@/lib/near"
import { timeAgo } from "@/lib/format"
import { mindsApi, type ApiWallet } from "@/modules/minds/api"
import { approvalChecks } from "@/modules/wallet/data/checks"
import { freezeErrorText } from "@/modules/wallet/components/FreezeDialog"
import { FreezeError } from "@/modules/wallet/hooks/useFreeze"
import { WrongAccountError } from "@/modules/wallet/hooks/useOwnerTransaction"
import { answerOutcome } from "@/modules/wallet/components/ApprovalsScreen"
import { ApiError } from "@/lib/api"
import type { ToolStep } from "@/modules/chat/data/events"
import type { ActiveRun } from "@/modules/chat/hooks/ChatRunProvider"

afterEach(() => vi.unstubAllGlobals())

const wallet = (over: Partial<ApiWallet> = {}): ApiWallet => ({
  address: "abc",
  shared: false,
  balanceNear: "42",
  frozen: false,
  policy: { perTransactionNear: "2", whitelist: ["landlord-rent.testnet"], transactionTypes: ["transfer"], boundToThisWallet: true },
  ...over,
})

describe("compareNear", () => {
  it("compares decimals exactly", () => {
    expect(compareNear("2", "2.0")).toBe(0)
    expect(compareNear("10", "9.999999999999999999999999")).toBe(1)
    expect(compareNear("0.05", "0.5")).toBe(-1)
    expect(compareNear("abc", "1")).toBeNull()
  })
})

describe("approvalChecks (A1.1)", () => {
  it("passes a payment inside every limit", () => {
    const r = approvalChecks({ to: "landlord-rent.testnet", amountNear: "1.8" }, wallet())
    expect(r.next).toBe("approve")
    expect(r.checks).toEqual([
      { ok: true, text: "Within your 2 NEAR limit" },
      { ok: true, text: "On your list of addresses" },
      { ok: true, text: "Enough balance: 42.00 NEAR" },
    ])
  })
  it("sends the owner to add a new address first", () => {
    const r = approvalChecks({ to: "spotify-family.testnet", amountNear: "1.2" }, wallet())
    expect(r.next).toBe("add_address")
    expect(r.checks[1]).toEqual({ ok: false, text: "Not on your list: blocked even if you approve" })
  })
  it("puts the limit before the list, and frozen before both", () => {
    expect(approvalChecks({ to: "x.testnet", amountNear: "25" }, wallet()).next).toBe("change_limits")
    expect(approvalChecks({ to: "x.testnet", amountNear: "25" }, wallet({ frozen: true })).next).toBe("unfreeze")
  })
  it("warns about the balance without blocking", () => {
    const r = approvalChecks({ to: "landlord-rent.testnet", amountNear: "1" }, wallet({ balanceNear: "0.5" }))
    expect(r.next).toBe("approve")
    expect(r.checks.at(-1)).toEqual({ ok: false, text: "Not enough balance: 0.50 NEAR" })
  })
  it("skips checks the policy doesn't have (#79: fields can be null)", () => {
    const r = approvalChecks({ to: "x.testnet", amountNear: "5" }, wallet({ policy: { perTransactionNear: null, whitelist: null, transactionTypes: null, boundToThisWallet: true } }))
    expect(r.checks.map((c) => c.text)).toEqual(["Enough balance: 42.00 NEAR"])
  })
})

describe("timeAgo", () => {
  const now = new Date("2026-11-09T12:00:00Z")
  it("reads like the design", () => {
    expect(timeAgo("2026-11-09T11:59:40Z", now)).toBe("just now")
    expect(timeAgo("2026-11-09T11:48:00Z", now)).toBe("12 min ago")
    expect(timeAgo("2026-11-09T11:00:00Z", now)).toBe("1 h ago")
  })
})

describe("freeze", () => {
  it("posts to freeze or unfreeze and returns the transaction", async () => {
    const transaction = { receiverId: "outlayer.testnet", actions: [] }
    const fetchMock = vi.fn(async () => Response.json({ transaction }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(mindsApi.freezeTransaction("m1", true)).resolves.toEqual(transaction)
    await mindsApi.freezeTransaction("m1", false)
    const urls = (fetchMock.mock.calls as unknown as [string][]).map(([u]) => u)
    expect(urls).toEqual(["/api/v1/minds/m1/wallet/freeze", "/api/v1/minds/m1/wallet/unfreeze"])
  })
  it("says what happened when it fails", () => {
    expect(freezeErrorText(new FreezeError("sign", new Error("User rejected")), true)).toBe("Meteor didn't sign, so the wallet wasn't frozen.")
    expect(freezeErrorText(new FreezeError("sign", new WrongAccountError("me.testnet", ["you.testnet"])), true)).toContain("Switch it to me.testnet")
  })
})

describe("answerOutcome (A1.3 toast)", () => {
  const approval = { runId: "r1", threadId: "t1", toolCallId: "c1", tool: "send_payment", args: { to: "shop.testnet", amountNear: "0.1" }, requestedAt: "2026-11-09T10:00:00Z" }
  const answer = { runId: "r1", toolCallId: "c1", action: "approve" as const, approval }
  const view = (tools: ToolStep[]) => ({ runId: "r1", threadId: "t1", text: "", tools, status: "finished" as const, verified: null, error: null, thinking: false, at: null })
  const run = (over: Partial<ActiveRun>): ActiveRun => ({ id: 1, threadId: "t1", message: null, resumeOf: "r1", events: [], view: view([]), streaming: false, failed: null, ...over })
  const step = (status: ToolStep["status"], result?: unknown): ToolStep => ({ toolCallId: "c1", tool: "send_payment", status, args: approval.args, result })

  it("says sending, then sent with the transaction", () => {
    expect(answerOutcome(answer, run({ streaming: true }))).toMatchObject({ kind: "sending", title: "Sending 0.1 NEAR to shop.testnet" })
    const sent = answerOutcome(answer, run({ view: view([step("ok", { to: "shop.testnet", amountNear: "0.1", status: "sent", txHash: "tx9" })]) }))
    expect(sent).toMatchObject({ kind: "sent", title: "Sent 0.1 NEAR to shop.testnet", txHash: "tx9" })
  })
  it("says when the limits stopped it, with no transaction", () => {
    const blocked = answerOutcome(answer, run({ view: view([step("policy_denied")]) }))
    expect(blocked).toMatchObject({ kind: "blocked", detail: "Your limits stopped it before signing." })
    expect(blocked.txHash).toBeUndefined()
  })
  it("says when the answer never arrived", () => {
    expect(answerOutcome(answer, run({ failed: new ApiError(503, "engine_error") })).title).toBe("Couldn't send your answer")
    expect(answerOutcome(answer, run({ failed: new ApiError(409, "not_awaiting_approval") })).title).toContain("already answered")
  })
})
