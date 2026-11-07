"use client"

import { useQuery } from "@tanstack/react-query"
import {
  SAMPLE_APPROVALS,
  SAMPLE_MINDS,
  SAMPLE_RECENT_CHATS,
  type Mind,
  type RecentChat,
} from "@/modules/minds/data/minds"

// Every screen reads Minds through these hooks, so the shared React Query cache is the
// only "global state" (apps/fe/CLAUDE.md). Swap the queryFn for the API when it is wired.

export const mindKeys = {
  all: ["minds"] as const,
  approvals: (mindId: string) => ["minds", mindId, "approvals", "count"] as const,
  recentChats: (mindId: string) => ["minds", mindId, "threads", "recent"] as const,
}

export function useMinds() {
  return useQuery({ queryKey: mindKeys.all, queryFn: async (): Promise<Mind[]> => SAMPLE_MINDS })
}

export function useMind(mindId: string) {
  const query = useMinds()
  return { ...query, data: query.data?.find((m) => m.mindId === mindId) }
}

export function useApprovalsCount(mindId: string) {
  return useQuery({
    queryKey: mindKeys.approvals(mindId),
    queryFn: async (): Promise<number> => SAMPLE_APPROVALS[mindId] ?? 0,
  })
}

/** Needs the thread list route from #54; sample data until then. */
export function useRecentChats(mindId: string) {
  return useQuery({
    queryKey: mindKeys.recentChats(mindId),
    queryFn: async (): Promise<RecentChat[]> => SAMPLE_RECENT_CHATS[mindId] ?? [],
  })
}
