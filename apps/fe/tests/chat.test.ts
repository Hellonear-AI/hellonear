import { afterEach, describe, expect, it, vi } from "vitest"
import { chatApi } from "@/modules/chat/api"
import { foldRun, paymentOf, type RunEvent } from "@/modules/runs/data/events"
import { toolLabel } from "@/modules/runs/data/steps"
import { toTurns } from "@/modules/chat/hooks/useThread"

afterEach(() => vi.unstubAllGlobals())

let seq = 0
const ev = (type: string, extra: Partial<RunEvent> = {}): RunEvent => ({
  v: 1,
  type,
  runId: "run_1",
  mindId: "m1",
  seq: seq++,
  ts: `2026-11-09T10:42:0${seq % 10}Z`,
  ...extra,
})

describe("foldRun", () => {
  it("joins text and reads the gateway badge (docs/api-contract.md §3)", () => {
    seq = 0
    const v = foldRun([
      ev("run.started", { threadId: "thr_1" }),
      ev("text.delta", { text: "Hi " }),
      ev("text.delta", { text: "there" }),
      ev("run.finished"),
      ev("run.verified", { verification: { status: "verified", level: "gateway_tee" } }),
    ])
    expect(v).toMatchObject({ runId: "run_1", threadId: "thr_1", text: "Hi there", status: "finished", verified: "gateway_tee" })
  })

  it("gives no badge for anything but a verified run", () => {
    seq = 0
    const v = foldRun([ev("run.verified", { verification: { status: "not_applicable" } })])
    expect(v.verified).toBeNull()
  })

  it("orders events by seq", () => {
    seq = 0
    const a = ev("text.delta", { text: "a" })
    const b = ev("text.delta", { text: "b" })
    expect(foldRun([b, a]).text).toBe("ab")
  })

  it("waits on an approval, then shows the sent payment after approve", () => {
    seq = 0
    const args = { to: "shop.testnet", amountNear: "1.5" }
    const paused = [ev("tool.called", { toolCallId: "c1", tool: "send_payment", args }), ev("tool.approval_required", { toolCallId: "c1", tool: "send_payment", args })]
    expect(foldRun(paused)).toMatchObject({ status: "awaiting_approval", tools: [{ status: "awaiting_approval" }] })

    const done = foldRun([
      ...paused,
      ev("tool.result", { toolCallId: "c1", tool: "send_payment", status: "ok", result: { ...args, status: "sent", txHash: "tx1" } }),
      ev("run.finished"),
    ])
    expect(done.status).toBe("finished")
    expect(done.tools[0].status).toBe("ok")
    expect(paymentOf(done.tools[0])).toMatchObject({ to: "shop.testnet", amountNear: "1.5", txHash: "tx1" })
  })

  it("reads a refused payment from the result's own status (#42)", () => {
    seq = 0
    const v = foldRun([
      ev("tool.called", { toolCallId: "c1", tool: "send_payment" }),
      ev("tool.result", { toolCallId: "c1", tool: "send_payment", status: "ok", result: { to: "x.testnet", amountNear: "25", status: "policy_denied" } }),
    ])
    expect(v.tools[0].status).toBe("policy_denied")
  })

  it("still waits when the paused stream ends with run.finished and run.verified", () => {
    seq = 0
    const v = foldRun([
      ev("step.started"),
      ev("tool.approval_required", { toolCallId: "c1", tool: "send_payment" }),
      ev("step.finished"),
      ev("run.finished"),
      ev("run.verified", { verification: { status: "verified", level: "gateway_tee" } }),
    ])
    expect(v.status).toBe("awaiting_approval")
    expect(v.tools[0].status).toBe("awaiting_approval")
  })

  it("marks an approval the run went past as declined", () => {
    seq = 0
    const v = foldRun([ev("tool.approval_required", { toolCallId: "c1", tool: "send_payment" }), ev("text.delta", { text: "Okay, I won't." }), ev("run.finished")])
    expect(v.tools[0].status).toBe("declined")
  })

  it("keeps run.error", () => {
    seq = 0
    expect(foldRun([ev("run.error", { error: "engine_stream_interrupted" })])).toMatchObject({ status: "error", error: "engine_stream_interrupted" })
  })
})

describe("toTurns", () => {
  it("pairs each run's user message and reply, oldest first", () => {
    const turns = toTurns(
      [
        { id: "1", role: "user", text: "Hi", createdAt: "2026-11-09T10:00:00Z", runId: "r1" },
        { id: "2", role: "assistant", text: "Hello", createdAt: "2026-11-09T10:00:02Z", runId: "r1" },
        { id: "3", role: "user", text: "Pay rent", createdAt: "2026-11-09T10:01:00Z", runId: "r2" },
      ],
      new Map()
    )
    expect(turns.map((t) => [t.runId, t.message, t.view.text])).toEqual([
      ["r1", "Hi", "Hello"],
      ["r2", "Pay rent", ""],
    ])
  })
})

describe("toolLabel", () => {
  it("has plain words, and a neutral line for unknown tools", () => {
    expect(toolLabel("get_balance")).toBe("Checking the balance")
    expect(toolLabel("something_new")).toBe("Using a tool")
  })
})

describe("chatApi.send", () => {
  it("reads SSE events across chunk boundaries and skips pings", async () => {
    const body = ': ping\n\ndata: {"type":"run.started","seq":0,"threadId":"thr_1"}\n\ndata: {"type":"text.de' + 'lta","seq":1,"text":"Hi"}\n\n'
    const chunks = [body.slice(0, 30), body.slice(30, 70), body.slice(70)]
    const stream = new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch))
        c.close()
      },
    })
    const fetchMock = vi.fn(async () => new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }))
    vi.stubGlobal("fetch", fetchMock)

    const got: RunEvent[] = []
    await chatApi.send("m1", { message: "hey" }, (e) => got.push(e))
    expect(got.map((e) => e.type)).toEqual(["run.started", "text.delta"])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/v1/minds/m1/chat")
    // The owner's time zone rides along (#112), so "2pm tomorrow" means their clock.
    expect(JSON.parse(init.body as string)).toEqual({ message: "hey", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
  })

  it("throws the backend's error before a stream starts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "thread_not_found" }, { status: 404 })))
    await expect(chatApi.send("m1", { message: "hey", threadId: "thr_x" }, () => {})).rejects.toMatchObject({ code: "thread_not_found" })
  })
})

describe("thinking", () => {
  it("is on while the model reasons and off once it writes or calls a tool", () => {
    seq = 0
    expect(foldRun([ev("run.started"), ev("reasoning.delta", { text: "hmm" })]).thinking).toBe(true)
    expect(foldRun([ev("reasoning.delta", { text: "hmm" }), ev("text.delta", { text: "Hi" })]).thinking).toBe(false)
    expect(foldRun([ev("reasoning.delta", { text: "hmm" }), ev("tool.called", { toolCallId: "c", tool: "get_balance" })]).thinking).toBe(false)
  })
})

describe("text around an approval", () => {
  it("starts the reply after the pause on a new paragraph", () => {
    seq = 0
    const v = foldRun([
      ev("text.delta", { text: "Waiting for your OK." }),
      ev("tool.approval_required", { toolCallId: "c1", tool: "send_payment" }),
      ev("run.finished"),
      ev("text.delta", { text: "Done!" }),
    ])
    expect(v.text).toBe("Waiting for your OK.\n\nDone!")
  })
})

describe("while an approval is being answered", () => {
  it("keeps the tool waiting until the resumed run ends, so its card can say Sending", () => {
    seq = 0
    const paused = [ev("tool.approval_required", { toolCallId: "c1", tool: "send_payment" }), ev("run.finished")]
    const going = foldRun([...paused, ev("step.started")])
    expect(going.status).toBe("running")
    expect(going.tools[0].status).toBe("awaiting_approval")
    expect(foldRun([...paused, ev("step.started"), ev("run.finished")]).tools[0].status).toBe("declined")
  })
})

describe("a second approval in the same run (split bill, #177)", () => {
  const firstPaused = () => [ev("tool.approval_required", { toolCallId: "c1", tool: "send_payment" }), ev("run.finished"), ev("run.verified")]
  it("keeps the next payment waiting after the first one was approved and sent", () => {
    seq = 0
    const v = foldRun([
      ...firstPaused(),
      ev("tool.result", { toolCallId: "c1", tool: "send_payment", result: { status: "sent", txHash: "Tx1" } }),
      ev("step.started"),
      ev("tool.called", { toolCallId: "c2", tool: "send_payment" }),
      ev("tool.approval_required", { toolCallId: "c2", tool: "send_payment" }),
      ev("run.finished"),
      ev("run.verified"),
    ])
    expect(v.tools.map((t) => [t.toolCallId, t.status])).toEqual([["c1", "ok"], ["c2", "awaiting_approval"]])
    expect(v.status).toBe("awaiting_approval")
  })

  it("a first payment the run went past is declined, the next one still waits", () => {
    seq = 0
    const v = foldRun([
      ...firstPaused(),
      ev("text.delta", { text: "Skipping that one." }),
      ev("tool.called", { toolCallId: "c2", tool: "send_payment" }),
      ev("tool.approval_required", { toolCallId: "c2", tool: "send_payment" }),
      ev("run.finished"),
    ])
    expect(v.tools.map((t) => [t.toolCallId, t.status])).toEqual([["c1", "declined"], ["c2", "awaiting_approval"]])
    expect(v.status).toBe("awaiting_approval")
  })
})

describe("reply parts", () => {
  it("keeps text and tools in the order they happened", () => {
    seq = 0
    const v = foldRun([
      ev("text.delta", { text: "On it. " }),
      ev("text.delta", { text: "Waiting for your OK." }),
      ev("tool.called", { toolCallId: "c1", tool: "send_payment" }),
      ev("tool.approval_required", { toolCallId: "c1", tool: "send_payment" }),
      ev("run.finished"),
      ev("tool.result", { toolCallId: "c1", tool: "send_payment", status: "ok", result: { status: "sent" } }),
      ev("text.delta", { text: "Sent!" }),
    ])
    expect(v.parts).toEqual([
      { kind: "text", text: "On it. Waiting for your OK." },
      { kind: "tool", toolCallId: "c1" },
      { kind: "text", text: "Sent!" },
    ])
  })
})

describe("a reply never vanishes", () => {
  it("uses the stored message when the events carry no text", () => {
    const empty = { runId: "r1", threadId: null, text: "", parts: [], tools: [], status: "finished" as const, verified: null, error: null, thinking: false, at: null }
    const turns = toTurns(
      [
        { id: "1", role: "user", text: "hi", createdAt: "2026-11-09T10:00:00Z", runId: "r1" },
        { id: "2", role: "assistant", text: "Hello!", createdAt: "2026-11-09T10:00:05Z", runId: "r1" },
      ],
      new Map([["r1", empty]])
    )
    expect(turns[0].view.text).toBe("Hello!")
    expect(turns[0].view.parts).toEqual([{ kind: "text", text: "Hello!" }])
  })
})
