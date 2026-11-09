import { ApprovalsScreen } from "@/modules/wallet/components/ApprovalsScreen"

export const metadata = { title: "Approvals" }

export default async function Page({ params }: { params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  return <ApprovalsScreen mindId={mindId} />
}
