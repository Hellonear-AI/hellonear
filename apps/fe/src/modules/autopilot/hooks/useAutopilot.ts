"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { autopilotApi, type Autopilot, type Canvas } from "@/modules/autopilot/api"

const keys = {
  list: (mindId: string) => ["minds", mindId, "workflows"] as const,
  one: (mindId: string, id: string) => ["minds", mindId, "workflows", id] as const,
  autopilot: (mindId: string, id: string) => ["minds", mindId, "workflows", id, "autopilot"] as const,
  runs: (mindId: string, id: string) => ["minds", mindId, "workflows", id, "runs"] as const,
}

export function useWorkflows(mindId: string) {
  return useQuery({ queryKey: keys.list(mindId), queryFn: () => autopilotApi.workflows(mindId) })
}

export function useWorkflow(mindId: string, workflowId: string | null) {
  return useQuery({
    queryKey: keys.one(mindId, workflowId ?? ""),
    queryFn: () => autopilotApi.workflow(mindId, workflowId as string),
    enabled: Boolean(workflowId),
  })
}

export function useAutopilotState(mindId: string, workflowId: string) {
  return useQuery({ queryKey: keys.autopilot(mindId, workflowId), queryFn: () => autopilotApi.autopilot(mindId, workflowId) })
}

/** Runs, newest first. Scheduled runs have no stream (§2), so the list is read again while one runs. */
export function useWorkflowRuns(mindId: string, workflowId: string | null, watching: boolean) {
  return useQuery({
    queryKey: keys.runs(mindId, workflowId ?? ""),
    queryFn: () => autopilotApi.runs(mindId, workflowId as string),
    enabled: Boolean(workflowId),
    refetchInterval: (q) => (watching || q.state.data?.some((r) => r.status === "running") ? 3000 : false),
  })
}

/** Turn a job on or pause it. A 409 `cannot_autopilot` stays an error with its `issues` for the card. */
export function useSetAutopilot(mindId: string, workflowId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => autopilotApi.setAutopilot(mindId, workflowId, enabled),
    onSuccess: (autopilot: Autopilot) => queryClient.setQueryData(keys.autopilot(mindId, workflowId), autopilot),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.autopilot(mindId, workflowId) }),
  })
}

/** Save a ready job (P1.2), then turn it on when `turnOn` (owners only; a try-out can't, #43). */
export function useAddJob(mindId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ workflowId, canvas, turnOn }: { workflowId: string; canvas: Canvas; turnOn: boolean }) => {
      await autopilotApi.save(mindId, workflowId, canvas)
      if (turnOn) await autopilotApi.setAutopilot(mindId, workflowId, true)
      return workflowId
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.list(mindId) }),
  })
}

export function useRemoveJob(mindId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workflowId: string) => autopilotApi.remove(mindId, workflowId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.list(mindId) }),
  })
}

export const autopilotKeys = keys
