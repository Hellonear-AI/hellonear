"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { isApiCode } from "@/lib/api"
import { telegramKeys } from "@/lib/queryKeys"
import { useSession } from "@/modules/auth/hooks/useSession"
import { connectionsApi } from "@/modules/connections/api"

/** The Mind's Telegram bot. While it waits for the owner to open the link, it is read every 3 s. */
export function useTelegram(mindId: string) {
  return useQuery({
    queryKey: telegramKeys.mind(mindId),
    enabled: Boolean(useSession().data),
    queryFn: () => connectionsApi.telegram(mindId),
    refetchInterval: (q) => (q.state.data?.connected && !q.state.data.linked ? 3000 : false),
  })
}

/** Connect a bot, or replace it: the backend checks the token with Telegram; a new token resets the link. */
export function useConnectTelegram(mindId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => connectionsApi.connectTelegram(mindId, token),
    onSuccess: (telegram) => queryClient.setQueryData(telegramKeys.mind(mindId), telegram),
  })
}

/** Stop the bot answering. 404 `not_connected` is what was wanted. */
export function useDisconnectTelegram(mindId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      try {
        await connectionsApi.disconnectTelegram(mindId)
      } catch (err) {
        if (!isApiCode(err, "not_connected")) throw err
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: telegramKeys.mind(mindId) }),
  })
}
