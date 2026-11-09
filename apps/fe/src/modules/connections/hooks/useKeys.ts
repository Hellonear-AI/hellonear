"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ApiError } from "@/lib/api"
import { useSession } from "@/modules/auth/hooks/useSession"
import { connectionsApi } from "@/modules/connections/api"
import type { ApiConnection } from "@/modules/minds/api"
import { skillKeys } from "@/modules/skills/hooks/useSkills"

const secretKeys = { all: ["secrets"] as const }

/** The account's saved keys (names, sites, dates; never values). */
export function useSecrets() {
  return useQuery({ queryKey: secretKeys.all, enabled: Boolean(useSession().data), queryFn: connectionsApi.secrets })
}

/** Add a key, or replace one with the same name. */
export function useSaveSecret() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, value, allowedHosts }: { name: string; value: string; allowedHosts: string[] }) => connectionsApi.putSecret(name, { value, allowedHosts }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: secretKeys.all }),
  })
}

export function useDeleteSecret() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      try {
        await connectionsApi.deleteSecret(name)
      } catch (err) {
        // Already gone is what was wanted.
        if (!(err instanceof ApiError && err.status === 404)) throw err
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: secretKeys.all }),
  })
}

/** Disconnect an app (also cancels an unfinished attempt). 404 means there was nothing to remove. */
export function useDisconnect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (toolkit: ApiConnection["toolkit"]) => {
      try {
        await connectionsApi.disconnect(toolkit)
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: skillKeys.connections }),
  })
}
