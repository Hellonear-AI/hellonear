import { SkillsScreen } from "@/modules/skills/components/SkillsScreen"

export const metadata = { title: "Skills" }

export default async function Page({ params }: { params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  return <SkillsScreen mindId={mindId} />
}
