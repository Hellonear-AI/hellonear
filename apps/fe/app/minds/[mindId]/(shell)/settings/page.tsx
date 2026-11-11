import { SettingsScreen } from "@/modules/settings/components/SettingsScreen"

export const metadata = { title: "Mind settings" }

export default async function Page({ params }: { params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  return <SettingsScreen mindId={mindId} />
}
