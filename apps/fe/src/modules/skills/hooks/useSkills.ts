"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSession } from "@/modules/auth/hooks/useSession"
import { mindsApi, type ApiConnection } from "@/modules/minds/api"
import type { Mind } from "@/modules/minds/data/minds"
import { mindKeys } from "@/modules/minds/hooks/useMinds"

export const skillKeys = {
  catalog: ["skills"] as const,
  connections: ["connections"] as const,
}

/** Every skill a Mind may equip (`GET /skills`, cached 60 s by the backend). */
export function useSkillCatalog() {
  return useQuery({
    queryKey: skillKeys.catalog,
    enabled: Boolean(useSession().data),
    queryFn: mindsApi.skills,
    staleTime: 60_000,
  })
}

/**
 * The account's app connections (`GET /connections`). While one is being connected in another
 * window, it is read every 3 s so the page updates by itself (design K1.3).
 */
export function useConnections({ watching = null }: { watching?: ApiConnection["toolkit"] | null } = {}) {
  return useQuery({
    queryKey: skillKeys.connections,
    enabled: Boolean(useSession().data),
    queryFn: mindsApi.connections,
    // Stops by itself once the app being connected shows as connected.
    refetchInterval: (q) => (watching && connectionStatus(q.state.data, watching) !== "connected" ? 3000 : false),
  })
}

export function connectionStatus(connections: ApiConnection[] | undefined, toolkit: ApiConnection["toolkit"]) {
  return connections?.find((c) => c.toolkit === toolkit)?.status ?? "not_connected"
}

/** Equip or remove skills (`PATCH /minds/{id}` with the whole list). No wallet signature. */
export function useSetSkills(mindId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (skills: string[]) => mindsApi.update(mindId, { skills }),
    onSuccess: (mind) => {
      queryClient.setQueryData<Mind[]>(mindKeys.all, (old) => old?.map((m) => (m.mindId === mind.id ? { ...m, skills: mind.skills } : m)))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: mindKeys.all }),
  })
}

/** Open a Composio Connect Link in a new window (Google signs in there; HelloNear never sees the password). */
export function useConnect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (toolkit: ApiConnection["toolkit"]) => {
      // Open the window first, inside the click, so the browser doesn't block it as a pop-up.
      const win = window.open("about:blank", "_blank")
      // The other site gets no handle back to this page.
      if (win) win.opener = null
      try {
        const url = await mindsApi.connect(toolkit)
        if (win) win.location.href = url
        else window.location.href = url
      } catch (err) {
        win?.close()
        throw err
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: skillKeys.connections }),
  })
}
