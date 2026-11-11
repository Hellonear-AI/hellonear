"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { mindHref } from "@/components/layout/nav"
import { isApiCode } from "@/lib/api"
import { chatKeys, mindKeys } from "@/lib/queryKeys"
import { writePref } from "@/lib/storage"
import { mindsApi } from "@/modules/minds/api"
import type { RecentChat } from "@/modules/minds/data/minds"

/** A chat title the backend takes: 1 to 60 characters once trimmed, runs of spaces as one. */
export function cleanTitle(title: string): string | null {
  const t = title.trim().replace(/\s+/g, " ")
  return t.length >= 1 && t.length <= 60 ? t : null
}

/** Rename and delete a chat from Recent chats (#207). */
export function useThreadActions(mindId: string) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const key = mindKeys.recentChats(mindId)

  const rename = useMutation({
    mutationFn: ({ threadId, title }: { threadId: string; title: string }) => mindsApi.renameThread(mindId, threadId, title),
    // The new title shows at once; the list is read again either way.
    onMutate: async ({ threadId, title }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData<RecentChat[]>(key)
      queryClient.setQueryData<RecentChat[]>(key, (chats) => chats?.map((c) => (c.threadId === threadId ? { ...c, title } : c)))
      return { before }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.before) queryClient.setQueryData(key, ctx.before)
      toast.error("Could not rename the chat", { description: "No changes were made. Please try again." })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  const remove = useMutation({
    mutationFn: (threadId: string) => mindsApi.deleteThread(mindId, threadId),
    onSuccess: (_data, threadId) => {
      const href = `${mindHref(mindId, "chat")}/${threadId}`
      // Leave the chat first if it is open, so nothing reads it after it is gone.
      if (pathname === href) router.replace(mindHref(mindId, "chat"))
      queryClient.setQueryData<RecentChat[]>(key, (chats) => chats?.filter((c) => c.threadId !== threadId))
      queryClient.removeQueries({ queryKey: chatKeys.thread(mindId, threadId) })
      writePref(`hellonear.draft.${mindId}.${threadId}`, null)
      void queryClient.invalidateQueries({ queryKey: key })
      toast.success("Chat deleted")
    },
    onError: (err) => {
      if (isApiCode(err, "thread_busy")) {
        toast.error("Could not delete the chat", { description: "The Mind is still working in it. Stop the reply or answer its approval first." })
      } else if (isApiCode(err, "thread_not_found")) {
        void queryClient.invalidateQueries({ queryKey: key })
      } else {
        toast.error("Could not delete the chat", { description: "No changes were made. Please try again." })
      }
    },
  })

  return { rename, remove }
}
