"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ApiError } from "@/lib/api"
import { connectionKeys } from "@/lib/queryKeys"
import { useSession } from "@/modules/auth/hooks/useSession"
import { connectionsApi, type ApiConnection, type Toolkit } from "@/modules/connections/api"

// App connections (#13, design K1, K2): account level, read by Connections and by Skills (whose
// cards say whether their app is connected).

/**
 * The account's app connections (`GET /connections`). While one is being connected in another
 * window, it is read every 3 s so the page updates by itself (design K1.3).
 */
export function useConnections({ watching = null }: { watching?: Toolkit | null } = {}) {
  return useQuery({
    queryKey: connectionKeys.all,
    enabled: Boolean(useSession().data),
    queryFn: connectionsApi.connections,
    // Stops by itself once the app being connected shows as connected.
    refetchInterval: (q) => (watching && connectionStatus(q.state.data, watching) !== "connected" ? 3000 : false),
  })
}

export function connectionStatus(connections: ApiConnection[] | undefined, toolkit: Toolkit) {
  return connections?.find((c) => c.toolkit === toolkit)?.status ?? "not_connected"
}

/** Open a Composio Connect Link in a new window (Google signs in there; HelloNear never sees the password). */
export function useConnect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (toolkit: Toolkit) => {
      // Open the window first, inside the click, so the browser doesn't block it as a pop-up.
      const win = window.open("about:blank", "_blank")
      // The other site gets no handle back to this page.
      if (win) win.opener = null
      try {
        const url = await connectionsApi.connect(toolkit)
        if (win) win.location.href = url
        else window.location.href = url
      } catch (err) {
        win?.close()
        throw err
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: connectionKeys.all }),
  })
}

/** Disconnect an app (also cancels an unfinished attempt). 404 means there was nothing to remove. */
export function useDisconnect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (toolkit: Toolkit) => {
      try {
        await connectionsApi.disconnect(toolkit)
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: connectionKeys.all }),
  })
}
