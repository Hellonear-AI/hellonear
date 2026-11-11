import type { ReactNode } from "react"
import { ChatRunProvider } from "@/modules/chat/hooks/ChatRunProvider"
import { MindGate } from "@/modules/minds/components/MindGate"

// Every Mind screen: the session and ownership check, and the one chat run in progress. The app
// shell (sidebar, rail, phone header) is in `(shell)/layout.tsx`; the Builder in `(focus)` has
// none, so it gets the whole screen (Ancung, 9 Nov; design B1).
export default async function MindLayout({ children, params }: { children: ReactNode; params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  return (
    <MindGate mindId={mindId}>
      <ChatRunProvider mindId={mindId}>{children}</ChatRunProvider>
    </MindGate>
  )
}
