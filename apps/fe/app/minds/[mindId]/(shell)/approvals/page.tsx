import { redirect } from "next/navigation"

// There is no Approvals page since 11 Nov (Ancung and Axel: the chat card answers every request,
// and Recent chats marks the chats that wait). Old links land on the chat.
export default async function Page({ params }: { params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  redirect(`/minds/${mindId}/chat`)
}
