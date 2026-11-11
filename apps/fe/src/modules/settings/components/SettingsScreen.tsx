"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { PageTitle } from "@/components/elements/PageTitle"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsTryOut } from "@/modules/auth/hooks/useSession"
import { useFullMind, useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"
import { AutoApproveSection } from "@/modules/settings/components/AutoApproveSection"
import { GeneralSection } from "@/modules/settings/components/GeneralSection"
import { MemorySection } from "@/modules/settings/components/MemorySection"

export type SettingsTab = "general" | "memory" | "approvals"

export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "memory", label: "Memory" },
  { id: "approvals", label: "Approvals" },
]

/** The tab in the URL (`?tab=memory`), General when it is missing or unknown. */
export const settingsTabOf = (value: string | null): SettingsTab => SETTINGS_TABS.find((t) => t.id === value)?.id ?? "general"

/**
 * Mind settings in three parts (Ancung, 11 Nov, like Claude's settings): General (name, voice,
 * model, delete), Memory (#209) and Approvals (#167), as a line tab bar like Skills' at every
 * width. The tab is in the URL, replaced rather than pushed, so a link
 * opens it and Back leaves Settings.
 */
export function SettingsScreen({ mindId }: { mindId: string }) {
  const router = useRouter()
  const tab = settingsTabOf(useSearchParams().get("tab"))
  const shell = useMind(mindId).data
  const wallet = useMindWallet(mindId).data
  const full = useFullMind(mindId)
  const tryOut = useIsTryOut()
  const mind = full.data
  const name = shell?.name ?? mind?.name ?? "Your Mind"
  const go = (next: SettingsTab) => router.replace(next === "general" ? "?" : `?tab=${next}`, { scroll: false })

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 pb-28 md:px-10 md:py-10">
      <PageTitle title={`${name}'s settings`} description={`How ${name} is named and talks, what it remembers, and what it may do without asking.`} />

      {/* The same line tab bar as Skills, at every width (Ancung, 11 Nov: tidier than a side menu).
          Three tabs fit a phone, so no scrolling or edge fade. */}
      <Tabs value={tab} onValueChange={(v) => go(settingsTabOf(String(v)))}>
        <TabsList variant="line" aria-label="Settings" className="w-max gap-5 p-0 pb-[5px]">
          {SETTINGS_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-none px-0.5 py-2">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div>
        {full.isPending || !mind ? (
          <Skeleton className="h-96 w-full rounded-lg" />
        ) : (
          // A new key per tab, so each one comes in with a short fade and starts from what is saved.
          <div key={tab} className="animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none">
            {tab === "general" && <GeneralSection mind={mind} name={name} wallet={wallet} tryOut={tryOut} />}
            {tab === "memory" && <MemorySection mind={mind} name={name} tryOut={tryOut} />}
            {tab === "approvals" && <AutoApproveSection mind={mind} name={name} wallet={wallet} tryOut={tryOut} />}
          </div>
        )}
      </div>
    </div>
  )
}
