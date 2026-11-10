"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { HourglassIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "cn"
import { graphKeys } from "@/lib/queryKeys"
import { mindHref } from "@/components/layout/nav"
import { api } from "@/lib/api"
import { shortWhen, clockTime } from "@/lib/format"
import { StepRow } from "@/modules/runs/components/ReplySteps"
import { pendingStep, type RunEvent } from "@/modules/runs/data/events"
import { stepText } from "@/modules/runs/data/steps"
import { TOOLS } from "@/modules/runs/data/tools"
import { useChatRun } from "@/modules/chat/hooks/ChatRunProvider"
import { MindGraph } from "@/modules/graph/components/MindGraph"
import { buildGraph, callNode, callsOf, liveStates, type GraphNode } from "@/modules/graph/data/graph"
import { skillCopy } from "@/modules/skills/data/skills"
import { XIcon } from "lucide-react"
import { templateAvatar } from "@/modules/minds/data/minds"
import { useApprovals, useMind } from "@/modules/minds/hooks/useMinds"
import { useSkillCatalog } from "@/modules/skills/hooks/useSkills"

/** The Mind's events from the last 7 days (docs/api-contract.md §7), for the history graph. */
function useMindEvents(mindId: string) {
  return useQuery({
    queryKey: graphKeys.events(mindId),
    queryFn: async () => (await api<{ events: RunEvent[] }>(`/minds/${encodeURIComponent(mindId)}/events?limit=2000`)).events,
    staleTime: 60_000,
  })
}

const KIND_WORD: Record<GraphNode["kind"], string> = {
  mind: "Mind",
  skill: "Skill",
  tool: "Tool",
  app: "App",
  wallet: "Wallet",
  memory: "Memory",
  model: "Model",
  workflow: "Autopilot job",
}


/** One plain line on what a node is. */
function describe(n: GraphNode, mind: string): string {
  const rest = n.id.split(/:(.*)/)[1] ?? ""
  switch (n.kind) {
    case "mind":
      return `${mind} in the middle, with every skill it has. Pick anything to see its latest calls.`
    case "skill":
      return skillCopy(rest).blurb
    case "wallet":
      return `${mind}'s NEAR wallet. Every payment waits for you, and your limits are enforced in a TEE before anything is signed.`
    case "memory":
      return `What ${mind} remembers between chats.`
    case "workflow":
      return `A job ${mind} runs on its own from Autopilot.`
    case "app":
      return n.app === "mail"
        ? `${mind}'s own email address.`
        : n.app === "googlemeet"
          ? "Meet links for the meetings Daily planner schedules."
          : `Your ${n.label}, through the connection you made in Connections.`
    default:
      return TOOLS[rest]?.about ?? `A tool ${mind} can use.`
  }
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
  const approvalList = useApprovals(mindId).data
  const approvals = useMemo(() => approvalList ?? [], [approvalList])
  const { active } = useChatRun()
  const [selected, setSelected] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const name = mind?.name ?? "Your Mind"

  // When a run ends, read the history again so its calls stay on the graph.
  const wasStreaming = useRef(false)
  useEffect(() => {
    if (wasStreaming.current && !active?.streaming) void queryClient.invalidateQueries({ queryKey: graphKeys.events(mindId) })
    wasStreaming.current = Boolean(active?.streaming)
  }, [active?.streaming, mindId, queryClient])

  const activeEvents = active?.events
  const streaming = Boolean(active?.streaming)
  const events = useMemo(() => {
    const seen = new Set<string>()
    const all = [...(history.data ?? []), ...(activeEvents ?? [])].filter((e) => {
      const key = `${e.runId}:${e.seq}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return all.sort((a, b) => (a.ts ?? "").localeCompare(b.ts ?? ""))
  }, [history.data, activeEvents])
  const graph = useMemo(() => {
    const built = buildGraph({ mindId, name, skills: mind?.skills ?? [], catalog: catalog ?? [], events })
    const streamingRun = streaming ? (activeEvents?.at(-1)?.runId ?? null) : null
    return { ...built, nodes: liveStates(built.nodes, streamingRun, new Set(approvals.map((a) => a.toolCallId))) }
  }, [events, activeEvents, streaming, mindId, name, mind?.skills, catalog, approvals])

  // What the reply on screen (or the last one) used, for its trail on the graph.
  const trail = useMemo(() => {
    const ids = new Set<string>()
    for (const e of activeEvents ?? []) {
      if (e.type !== "tool.called" || !e.tool) continue
      const id = callNode(mindId, e)
      if (id) ids.add(id)
    }
    return [...ids]
  }, [activeEvents, mindId])

  const picked = graph.nodes.find((n) => n.id === selected) ?? null
  // A skill shows the calls of every tool under it; the Mind shows them all.
  const pickedCalls = useMemo(() => {
    if (!picked) return []
    const ids = new Set([picked.id])
    if (picked.kind === "mind") for (const n of graph.nodes) ids.add(n.id)
    for (const l of graph.links) if (l.source === picked.id) ids.add(l.target)
    return callsOf(ids, events, mindId)
  }, [picked, graph, events, mindId])

  // Esc lets go of the picked node.
  useEffect(() => {
    if (!selected) return
    const key = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null)
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [selected])
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
        avatarSrc={templateAvatar(mind?.templateId ?? "general-assistant")}
        selected={selected}
        onSelect={setSelected}
        trail={trail}
        live={streaming}
        run={activeEvents?.at(-1)?.runId ?? null}
        label={`A map of ${name}'s skills, apps and tools. The steps of this reply are listed below it.`}
        className="h-[360px] shrink-0 rounded-lg bg-muted/50"
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {picked && (
          <section aria-label={`About ${picked.label}`} className="flex flex-col gap-3 rounded-md bg-muted/50 p-3">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">{KIND_WORD[picked.kind]}</span>
                <span className="text-sm font-semibold text-foreground">{picked.label}</span>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelected(null)}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
              >
                <XIcon className="size-4" />
              </button>
            </div>
            <p className="text-[13px] text-muted-foreground">{describe(picked, name)}</p>
            <p className="text-xs text-muted-foreground">
              {picked.kind === "mind"
                ? `${graph.nodes.length - 1} skills, apps and tools on the map.`
                : picked.uses
                  ? `Used ${picked.uses} ${picked.uses === 1 ? "time" : "times"} in the last 7 days${picked.state ? `. ${STATE_WORDS[picked.state]}` : ""}${picked.at ? `, ${shortWhen(new Date(picked.at).toISOString())} ${clockTime(new Date(picked.at).toISOString())}` : ""}.`
                  : "Not used in the last 7 days."}
            </p>
            {pickedCalls.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Recent calls</span>
                {pickedCalls.map((t) => (
                  <StepRow key={t.toolCallId} step={t} />
                ))}
              </div>
            )}
          </section>
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
                      {p?.amountNear && p.to ? `${p.amountNear} NEAR to ${p.to}` : stepText(pendingStep(a)).label.replace(/\.\.\.$/, "")}
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
