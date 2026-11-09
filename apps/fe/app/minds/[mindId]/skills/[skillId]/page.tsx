import { SkillPage } from "@/modules/skills/components/SkillPage"

export const metadata = { title: "Skill" }

export default async function Page({ params }: { params: Promise<{ mindId: string; skillId: string }> }) {
  const { mindId, skillId } = await params
  return <SkillPage mindId={mindId} skillId={decodeURIComponent(skillId)} />
}
