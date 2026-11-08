"use client"

import { useQuery } from "@tanstack/react-query"
import { shortWhen } from "@/lib/format"
import { useSession } from "@/modules/auth/hooks/useSession"
import { mindsApi } from "@/modules/minds/api"
import type { Mind, RecentChat } from "@/modules/minds/data/minds"

// Every screen reads Minds through these hooks, so the shared React Query cache is the
// only "global state" (apps/fe/CLAUDE.md). They only run with a backend session; signing
// out clears the cache.

export const mindKeys = {
  all: ["minds"] as const,
  approvals: (mindId: string) => ["minds", mindId, "approvals"] as const,
  recentChats: (mindId: string) => ["minds", mindId, "threads", "recent"] as const,
}

function useSignedIn() {
  return Boolean(useSession().data)
}

/** The user's Minds, newest first, each with its wallet balance (one wallet read per Mind). */
export function useMinds() {
  return useQuery({
    queryKey: mindKeys.all,
    enabled: useSignedIn(),
    queryFn: async (): Promise<Mind[]> => {
      const minds = await mindsApi.list()
      return Promise.all(
        minds.map(async (m) => ({
          mindId: m.id,
          name: m.name,
          templateId: m.templateId,
          // A wallet that can't be read shouldn't hide the Mind: show it without a balance.
          balanceNear: await mindsApi.wallet(m.id).then(
            (w) => (w ? w.balanceNear : null),
            () => undefined
          ),
        }))
      )
    },
  })
}

export function useMind(mindId: string) {
  const query = useMinds()
  return { ...query, data: query.data?.find((m) => m.mindId === mindId) }
}

/** Runs paused on an approval (`GET …/approvals`); refreshed every 30 s while open. */
export function useApprovalsCount(mindId: string) {
  return useQuery({
    queryKey: mindKeys.approvals(mindId),
    enabled: useSignedIn(),
    queryFn: () => mindsApi.approvals(mindId),
    select: (approvals) => approvals.length,
    refetchInterval: 30_000,
  })
}

/** Chat threads (#54), newest first. Old threads without a stored first message get a plain title. */
export function useRecentChats(mindId: string) {
  return useQuery({
    queryKey: mindKeys.recentChats(mindId),
    enabled: useSignedIn(),
    queryFn: async (): Promise<RecentChat[]> =>
      (await mindsApi.threads(mindId)).map((t) => ({
        threadId: t.threadId,
        title: t.title ?? "Earlier chat",
        when: shortWhen(t.lastMessageAt),
      })),
  })
}
