import { NewMindFlow } from "@/modules/minds/components/NewMindFlow"

export const metadata = { title: "Choose a Mind" }

// The landing page's Choose buttons open `/minds/new?template=<id>` (apps/landing MindCards), so that card starts picked.
export default async function NewMindPage({ searchParams }: { searchParams: Promise<{ template?: string | string[] }> }) {
  const { template } = await searchParams
  return <NewMindFlow template={typeof template === "string" ? template : undefined} />
}
