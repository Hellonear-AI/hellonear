import { redirect } from "next/navigation"

export default async function MindIndex({ params }: { params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  redirect(`/minds/${mindId}/chat`)
}
