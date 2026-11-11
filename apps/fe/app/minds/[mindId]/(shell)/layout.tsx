import type { ReactNode } from "react"
import { AppShell } from "@/components/layout/AppShell"

export default async function ShellLayout({ children, params }: { children: ReactNode; params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  return <AppShell mindId={mindId}>{children}</AppShell>
}
