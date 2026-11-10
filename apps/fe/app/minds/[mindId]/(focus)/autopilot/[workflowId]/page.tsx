import { BuilderScreen } from "@/modules/builder/components/BuilderScreen"

export const metadata = { title: "Edit job" }

export default async function Page({ params }: { params: Promise<{ mindId: string; workflowId: string }> }) {
  const { mindId, workflowId } = await params
  return <BuilderScreen mindId={mindId} workflowId={decodeURIComponent(workflowId)} />
}
