"use client"

import { useQuery } from "@tanstack/react-query"
import { mindKeys } from "@/lib/queryKeys"
import { useSession } from "@/modules/auth/hooks/useSession"
import { mindsApi } from "@/modules/minds/api"
import { useMinds } from "@/modules/minds/hooks/useMinds"

/** Try-out users get 20 runs in all (docs/api-contract.md §7, `config.demo.runsPerUser`). */
export const TRY_OUT_MESSAGES = 20

/**
 * Messages a try-out user has left (design T1.3). The backend counts every run of the user's
 * Minds (`assertDemoRunAllowed`), so this counts the same: each Mind's runs, up to the limit.
 * Under `["minds", …]`, so it refreshes with the rest after every run. Null for wallet users.
 */
export function useTryOutLeft(): number | null {
  const demo = Boolean(useSession().data?.demo)
  const minds = useMinds().data
  const { data } = useQuery({
    queryKey: mindKeys.tryOutRuns(minds?.map((m) => m.mindId).join(",") ?? ""),
    enabled: demo && Boolean(minds),
    queryFn: async () => {
      const counts = await Promise.all((minds ?? []).map((m) => mindsApi.runs(m.mindId, TRY_OUT_MESSAGES).then((r) => r.length)))
      return counts.reduce((a, b) => a + b, 0)
    },
  })
  if (!demo || data === undefined) return null
  return Math.max(0, TRY_OUT_MESSAGES - data)
}
