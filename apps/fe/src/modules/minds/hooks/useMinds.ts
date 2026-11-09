"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { shortWhen } from "@/lib/format"
import { useSession } from "@/modules/auth/hooks/useSession"
import { mindsApi } from "@/modules/minds/api"
import { cleanThreadTitle, type Mind, type RecentChat } from "@/modules/minds/data/minds"

// Every screen reads Minds through these hooks, so the shared React Query cache is the
// only "global state" (apps/fe/CLAUDE.md). They only run with a backend session; signing
// out clears the cache.

export const mindKeys = {
  all: ["minds"] as const,
  templates: ["templates"] as const,
  approvals: (mindId: string) => ["minds", mindId, "approvals"] as const,
  wallet: (mindId: string) => ["minds", mindId, "wallet"] as const,
  payments: (mindId: string) => ["minds", mindId, "wallet", "payments"] as const,
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
          skills: m.skills,
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

/** The approvals themselves, oldest request first (Approvals screen, A1). */
export function useApprovals(mindId: string) {
  return useQuery({
    queryKey: mindKeys.approvals(mindId),
    enabled: useSignedIn(),
    queryFn: () => mindsApi.approvals(mindId),
    select: (approvals) => [...approvals].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
    refetchInterval: 30_000,
  })
}

/** The wallet's latest payments ("Recent decisions" in A1). */
export function usePayments(mindId: string, limit = 5) {
  return useQuery({
    queryKey: [...mindKeys.payments(mindId), limit],
    enabled: useSignedIn(),
    queryFn: () => mindsApi.payments(mindId, limit),
  })
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

/** The Mind's own wallet with its limits (`null`: no wallet yet). Chat uses it for the limit line and Freeze. */
export function useMindWallet(mindId: string) {
  return useQuery({
    queryKey: mindKeys.wallet(mindId),
    enabled: useSignedIn(),
    queryFn: () => mindsApi.wallet(mindId),
    staleTime: 30_000,
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
        title: cleanThreadTitle(t.title),
        when: shortWhen(t.lastMessageAt),
      })),
  })
}

/** The starter templates for Choose a Mind (`GET /templates`, cached 60 s by the backend). */
export function useTemplates() {
  return useQuery({
    queryKey: mindKeys.templates,
    enabled: useSignedIn(),
    queryFn: mindsApi.templates,
    staleTime: 60_000,
  })
}

/**
 * Creates a Mind from a template. The new Mind goes into the cached list right away, so
 * `MindGate` knows it before the refetch lands (otherwise it would show not found).
 */
export function useCreateMind() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: mindsApi.create,
    onSuccess: (mind) => {
      const created: Mind = { mindId: mind.id, name: mind.name, templateId: mind.templateId, skills: mind.skills, balanceNear: null }
      queryClient.setQueryData<Mind[]>(mindKeys.all, (old) => [created, ...(old ?? []).filter((m) => m.mindId !== mind.id)])
      void queryClient.invalidateQueries({ queryKey: mindKeys.all })
    },
  })
}
