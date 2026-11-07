import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { AppShell } from "@/components/layout/AppShell"
import { SAMPLE_MINDS } from "@/modules/minds/data/minds"

export default async function MindLayout({ children, params }: { children: ReactNode; params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  // Sample Minds until GET /v1/minds is wired; an unknown id is the not-found page (E1.3).
  if (!SAMPLE_MINDS.some((m) => m.mindId === mindId)) notFound()
  return <AppShell mindId={mindId}>{children}</AppShell>
}
