"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { HourglassIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "cn"
import { mindHref } from "@/components/layout/nav"
import { api } from "@/lib/api"
import { shortWhen, clockTime } from "@/lib/format"
import { StepRow } from "@/modules/chat/components/ReplySteps"
import type { RunEvent } from "@/modules/chat/data/events"
import { stepText } from "@/modules/chat/data/steps"
import { useChatRun } from "@/modules/chat/hooks/ChatRunProvider"
import { MindGraph } from "@/modules/graph/components/MindGraph"
import { buildGraph, type GraphNode } from "@/modules/graph/data/graph"
import { templateImage } from "@/modules/minds/data/minds"
import { useApprovals, useMind } from "@/modules/minds/hooks/useMinds"
import { useSkillCatalog } from "@/modules/skills/hooks/useSkills"

/** The Mind's events from the last 7 days (docs/api-contract.md §7), for the history graph. */
function useMindEvents(mindId: string) {
  return useQuery({
    queryKey: ["mind-events", mindId],
    queryFn: async () => (await api<{ events: RunEvent[] }>(`/minds/${encodeURIComponent(mindId)}/events?limit=2000`)).events,
    staleTime: 60_000,
  })
}

const STATE_WORDS: Record<NonNullable<GraphNode["state"]>, string> = {
  running: "Working now",
  waiting: "Waiting for your OK",
  ok: "Last call worked",
  error: "Last call failed",
  denied: "Last call was blocked by your limits",
}

/**
 * "What {Mind} is doing" (design C2, #17), beside the chat: the Mind Graph built from its skills
 * and the last 7 days of runs, lit live by the run on screen; what this run did so far, as the
 * chat's step rows; and what waits for the owner.
 */
export function LiveView({ mindId, className }: { mindId: string; className?: string }) {
  const mind = useMind(mindId).data
  const catalog = useSkillCatalog().data
  const history = useMindEvents(mindId)
  const approvals = useApprovals(mindId).data ?? []
  const { active } = useChatRun()
  const [selected, setSelected] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const name = mind?.name ?? "Your Mind"

  // When a run ends, read the history again so its calls stay on the graph.
  const wasStreaming = useRef(false)
  useEffect(() => {
    if (wasStreaming.current && !active?.streaming) void queryClient.invalidateQueries({ queryKey: ["mind-events", mindId] })
    wasStreaming.current = Boolean(active?.streaming)
  }, [active?.streaming, mindId, queryClient])

  const graph = useMemo(() => {
    const seen = new Set<string>()
    const events = [...(history.data ?? []), ...(active?.events ?? [])].filter((e) => {
      const key = `${e.runId}:${e.seq}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    events.sort((a, b) => (a.ts ?? "").localeCompare(b.ts ?? ""))
    return buildGraph({ mindId, name, skills: mind?.skills ?? [], catalog: catalog ?? [], events })
  }, [history.data, active?.events, mindId, name, mind?.skills, catalog])

  const picked = graph.nodes.find((n) => n.id === selected) ?? null
  const live = Boolean(active?.streaming)
  const steps = active?.view.tools ?? []

  return (
    <aside aria-labelledby="live-title" className={cn("flex min-h-0 flex-col gap-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="live-title" className="text-[15px] font-semibold text-foreground">
          What {name} is doing
        </h2>
        {live && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            Live
          </span>
        )}
      </div>

      <MindGraph
        mindId={mindId}
        nodes={graph.nodes}
        links={graph.links}
        avatarSrc={templateImage(mind?.templateId ?? "general-assistant")}
        selected={selected}
        onSelect={setSelected}
        label={`A map of ${name}'s skills, apps and tools. The steps of this reply are listed below it.`}
        className="h-[360px] shrink-0 rounded-lg bg-muted/50"
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {picked && picked.kind !== "mind" && (
          <div className="flex flex-col gap-0.5 rounded-md bg-muted/50 px-3 py-2.5">
            <span className="text-sm font-medium text-foreground">{picked.label}</span>
            <span className="text-xs text-muted-foreground">
              {picked.uses ? `Used ${picked.uses} ${picked.uses === 1 ? "time" : "times"} in the last 7 days` : "Not used in the last 7 days"}
              {picked.state ? `. ${STATE_WORDS[picked.state]}` : ""}
              {picked.at ? `, ${shortWhen(new Date(picked.at).toISOString())} ${clockTime(new Date(picked.at).toISOString())}` : ""}.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{live ? "This reply" : "Last reply"}</span>
          {steps.length ? (
            <div className="flex flex-col gap-1">
              {steps.map((t) => (
                <StepRow key={t.toolCallId} step={t} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {live ? "Thinking..." : `Send a message and watch ${name} reach for its skills here.`}
            </p>
          )}
        </div>

        {approvals.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Waiting for you</span>
            {approvals.map((a) => {
              const p = a.tool === "send_payment" ? (a.args as { to?: string; amountNear?: string } | null) : null
              return (
                <Link
                  key={a.toolCallId}
                  href={mindHref(mindId, "approvals")}
                  className="flex items-center gap-2.5 rounded-md px-1 py-1 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                    <HourglassIcon className="size-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] text-foreground">
                      {p?.amountNear && p.to ? `${p.amountNear} NEAR to ${p.to}` : stepText({ toolCallId: a.toolCallId, tool: a.tool, status: "awaiting_approval", args: a.args, result: null }).label.replace(/\.\.\.$/, "")}
                    </span>
                    <span className="text-xs text-muted-foreground">Waiting for your OK</span>
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
