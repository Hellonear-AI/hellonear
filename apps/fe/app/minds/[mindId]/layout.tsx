import type { ReactNode } from "react"
import { AppShell } from "@/components/layout/AppShell"
import { ChatRunProvider } from "@/modules/chat/hooks/ChatRunProvider"
import { MindGate } from "@/modules/minds/components/MindGate"

export default async function MindLayout({ children, params }: { children: ReactNode; params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  return (
    <MindGate mindId={mindId}>
      <ChatRunProvider mindId={mindId}>
        <AppShell mindId={mindId}>{children}</AppShell>
      </ChatRunProvider>
    </MindGate>
  )
}
