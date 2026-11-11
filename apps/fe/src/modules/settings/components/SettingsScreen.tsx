"use client"

import { BrainIcon, ListChecksIcon, SlidersHorizontalIcon, type LucideIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "cn"
import { PageTitle } from "@/components/elements/PageTitle"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsTryOut } from "@/modules/auth/hooks/useSession"
import { useFullMind, useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"
import { AutoApproveSection } from "@/modules/settings/components/AutoApproveSection"
import { GeneralSection } from "@/modules/settings/components/GeneralSection"
import { MemorySection } from "@/modules/settings/components/MemorySection"

export type SettingsTab = "general" | "memory" | "approvals"

export const SETTINGS_TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: SlidersHorizontalIcon },
  { id: "memory", label: "Memory", icon: BrainIcon },
  { id: "approvals", label: "Approvals", icon: ListChecksIcon },
]

/** The tab in the URL (`?tab=memory`), General when it is missing or unknown. */
export const settingsTabOf = (value: string | null): SettingsTab => SETTINGS_TABS.find((t) => t.id === value)?.id ?? "general"

/**
 * Mind settings in three parts (Ancung, 11 Nov, like Claude's settings): General (name, voice,
 * model, delete), Memory (#209) and Approvals (#167). A menu on the left from 1024 px, a tab bar
 * on top below that, as on Skills. The tab is in the URL, replaced rather than pushed, so a link
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
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-4 py-6 pb-28 md:px-10 md:py-10">
      <PageTitle title={`${name}'s settings`} description={`How ${name} is named and talks, what it remembers, and what it may do without asking.`} />

      {/* Below 1024 px: a line tab bar, as on Skills. */}
      <Tabs value={tab} onValueChange={(v) => go(settingsTabOf(String(v)))} className="lg:hidden">
        <TabsList variant="line" className="w-full justify-start">
          {SETTINGS_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-none">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex items-start gap-10">
        <nav aria-label="Settings" className="sticky top-6 hidden w-48 shrink-0 flex-col gap-0.5 lg:flex">
          {SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => go(id)}
              className={cn(
                "flex h-10 items-center gap-2.5 rounded-md px-3 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
                tab === id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
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
    </div>
  )
}
