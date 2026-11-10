"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { autopilotApi } from "@/modules/autopilot/api"
import { autopilotKeys } from "@/modules/autopilot/hooks/useAutopilot"
import type { Block } from "@/modules/builder/data/draft"
import { finishedWell, nodeSummary, withIf, type NodeRun, type TestState } from "@/modules/builder/data/testRun"

/**
 * Test run (B1.2): the saved job runs once and each block lights up from node.started and
 * node.finished. The API only runs a saved job, so changes must be saved first.
 */
export function useTestRun(mindId: string, workflowId: string | null, line: Block[]) {
  const queryClient = useQueryClient()
  const [test, setTest] = useState<TestState | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  async function runTest() {
    if (!workflowId) return
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setTest({ running: true, nodes: {}, status: null, failed: false })
    const put = (node: string, run: NodeRun) => setTest((t) => (t ? { ...t, nodes: { ...t.nodes, [node]: run } } : t))
    try {
      await autopilotApi.runNow(
        mindId,
        workflowId,
        (e) => {
          const ev = e as unknown as { type: string; node?: string; status?: string; output?: unknown; error?: unknown }
          if (ev.type === "node.started" && ev.node) put(ev.node, { status: "running" })
          if (ev.type === "node.finished" && ev.node) {
            put(ev.node, ev.status === "ok" ? { status: "ok", note: nodeSummary(ev.output) } : { status: "error", note: String(ev.error ?? "Failed").replace(/^\w*Error:\s*/, "") })
          }
          if (ev.type === "workflow.finished") setTest((t) => (t ? { ...t, status: ev.status ?? null } : t))
        },
        controller.signal
      )
      if (!controller.signal.aborted) setTest((t) => (t ? { ...t, running: false } : t))
    } catch {
      if (!controller.signal.aborted) setTest((t) => (t ? { ...t, running: false, failed: true } : t))
    }
    void queryClient.invalidateQueries({ queryKey: autopilotKeys.runs(mindId, workflowId) })
  }

  return {
    test,
    running: Boolean(test?.running),
    runTest,
    clear: () => setTest(null),
    /** What each block shows after a Test run, Ifs included (they send no events of their own). */
    lit: withIf(test?.nodes ?? {}, line, finishedWell(test)),
  }
}
