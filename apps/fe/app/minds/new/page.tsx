import { PublicShell } from "@/components/layout/PublicShell"
import { ScreenPlaceholder } from "@/modules/minds/components/ScreenPlaceholder"

export const metadata = { title: "Choose a Mind" }

export default function NewMindPage() {
  return (
    <PublicShell>
      <ScreenPlaceholder title="Choose a Mind" description="Pick a starting point, name it, then set its limits." />
    </PublicShell>
  )
}
