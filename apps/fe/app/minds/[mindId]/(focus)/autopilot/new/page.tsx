import { BuilderScreen } from "@/modules/builder/components/BuilderScreen"

export const metadata = { title: "New job" }

export default async function Page({ params }: { params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  return <BuilderScreen mindId={mindId} workflowId={null} />
}
