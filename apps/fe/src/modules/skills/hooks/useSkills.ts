"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { skillKeys } from "@/lib/queryKeys"
import { useSession } from "@/modules/auth/hooks/useSession"
import { mindsApi } from "@/modules/minds/api"
import { skillsApi } from "@/modules/skills/api"
import type { Mind } from "@/modules/minds/data/minds"
import { mindKeys } from "@/modules/minds/hooks/useMinds"

export { skillKeys } from "@/lib/queryKeys"

/** Every skill a Mind may equip (`GET /skills`, cached 60 s by the backend). */
export function useSkillCatalog() {
  return useQuery({
    queryKey: skillKeys.catalog,
    enabled: Boolean(useSession().data),
    queryFn: skillsApi.skills,
    staleTime: 60_000,
  })
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
