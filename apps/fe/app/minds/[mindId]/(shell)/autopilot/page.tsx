import { AutopilotScreen } from "@/modules/autopilot/components/AutopilotScreen"

export const metadata = { title: "Autopilot" }

export default async function Page({ params }: { params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  return <AutopilotScreen mindId={mindId} />
}
