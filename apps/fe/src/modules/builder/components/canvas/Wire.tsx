"use client"

import type { ReactNode } from "react"
import { cn } from "cn"
import { useNodeRun } from "@/modules/builder/components/canvas/TestRunContext"
import type { NodeRun } from "@/modules/builder/data/testRun"

/** Grey at rest; while its block works a light runs down it (`wire-flow`); then green or red. */
const wireTone = (run?: NodeRun) =>
  run?.status === "running" ? "wire-flow" : run?.status === "ok" ? "w-px bg-success" : run?.status === "error" ? "w-px bg-danger" : "w-px bg-border-strong"

/** The line from the block above, coloured by how the block below went in a Test run. */
export function Wire({ run, className }: { run?: NodeRun; className?: string }) {
  return <span aria-hidden className={cn(className, wireTone(run))} />
}

/** A block with the wire that leads down to it, coloured by that block's Test run. */
export function Linked({ nodeId, children }: { nodeId?: string; children: ReactNode }) {
  const run = useNodeRun(nodeId)
  return (
    <div className="flex flex-col items-center">
      <Wire run={run} className="h-6 transition-colors duration-300 ease-out" />
      {children}
    </div>
  )
}
