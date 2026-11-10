import { ConnectionsScreen } from "@/modules/connections/components/ConnectionsScreen"

export const metadata = { title: "Connections" }

export default async function Page({ params }: { params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  return <ConnectionsScreen mindId={mindId} />
}
