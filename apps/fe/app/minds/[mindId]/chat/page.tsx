import { ChatScreen } from "@/modules/chat/components/ChatScreen"

export const metadata = { title: "Chat" }

export default async function Page({ params }: { params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  return <ChatScreen mindId={mindId} threadId={null} />
}
