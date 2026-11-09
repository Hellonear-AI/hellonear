import { ChatScreen } from "@/modules/chat/components/ChatScreen"

export const metadata = { title: "Chat" }

export default async function Page({ params }: { params: Promise<{ mindId: string; threadId: string }> }) {
  const { mindId, threadId } = await params
  return <ChatScreen mindId={mindId} threadId={decodeURIComponent(threadId)} />
}
