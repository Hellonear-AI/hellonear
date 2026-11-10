"use client"

import { CheckIcon, CircleXIcon, XIcon } from "lucide-react"
import { cn } from "cn"
import type { EngineIssue } from "@/modules/builder/data/issues"
import { wentWrong, type TestState } from "@/modules/builder/data/testRun"

/** Save failed: the engine's issues (B1.3), or that nothing was saved. */
export function SaveProblems({ error, issues }: { error: string | null; issues: EngineIssue[] }) {
  if (!issues.length && !error) return null
  return (
    <div role="alert" className="mx-4 mt-4 flex items-start gap-2.5 rounded-md bg-danger-soft px-3.5 py-3 text-sm text-foreground md:mx-6">
      <CircleXIcon className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="flex flex-col gap-1">
        {error ?? "The job was not saved. Fix the following:"}
        {issues.length > 0 && (
          <ul className="list-disc pl-4 text-[13px]">
            {issues.map((i) => (
              <li key={`${i.node}${i.text}`}>{i.text}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** How a finished Test run went, until cleared. */
export function TestRunResult({ test, onClear }: { test: TestState | null; onClear: () => void }) {
  if (!test || test.running) return null
  return (
    <div role="status" className={cn("mx-4 mt-4 flex items-center gap-2.5 rounded-md px-3.5 py-2.5 text-sm text-foreground md:mx-6", wentWrong(test) ? "bg-danger-soft" : "bg-success-soft")}>
      {wentWrong(test) ? <XIcon className="size-4 shrink-0 text-danger" /> : <CheckIcon className="size-4 shrink-0 text-success" />}
      <span className="min-w-0 flex-1">
        {test.failed
          ? "The test run did not start. Please try again later."
          : test.status === "failed"
            ? "Test run finished with an error. The failed block is marked in red."
            : "Test run finished. Each block shows what it did."}
      </span>
      <button type="button" className="shrink-0 text-xs font-medium underline underline-offset-2" onClick={onClear}>
        Clear
      </button>
    </div>
  )
}
