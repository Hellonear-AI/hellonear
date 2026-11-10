"use client"

import Link from "next/link"
import { CheckIcon, PlugIcon, SearchIcon } from "lucide-react"
import { useRef, useState } from "react"
import { ErrorRetry } from "@/components/elements/ErrorRetry"
import { cn } from "cn"
import { PageTitle } from "@/components/elements/PageTitle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { mindHref } from "@/components/layout/nav"
import { useIsTryOut } from "@/modules/auth/hooks/useSession"
import type { ApiSkill } from "@/modules/skills/api"
import type { ApiConnection } from "@/modules/connections/api"
import { useMind, useMindWallet } from "@/modules/minds/hooks/useMinds"
import { SKILL_ICON } from "@/modules/skills/data/icons"
import { matchesSearch, skillCopy, skillLines, TOOLKIT_NAME } from "@/modules/skills/data/skills"
import { SkillLines } from "@/modules/skills/components/SkillLines"
import { useSkillCatalog } from "@/modules/skills/hooks/useSkills"
import { connectionStatus, useConnections } from "@/modules/connections/hooks/useConnections"
import { AddSkillDialog } from "@/modules/skills/components/SkillDialogs"
import { byCategory, CATEGORIES, categoryOf, type CategoryId } from "@/modules/skills/data/categories"
import { Pager, pageCount } from "@/components/elements/Pager"
import { prefersReducedMotion } from "@/lib/media"

/** Skills a page: a 3 by 3 grid on desktop. */
const PER_PAGE = 9

type Filter = "all" | "added" | "not_added"

/**
 * Skills (design "6 · Skills and apps", S1): every skill the engine has (`GET /skills`), what
 * each can touch, and one action per card: Settings when added, Connect when it needs an app
 * first (S2.2), else Add (S2.1). Blocked skills stay listed with the reason (S1.5).
 */
export function SkillsScreen({ mindId }: { mindId: string }) {
  const mind = useMind(mindId).data
  const wallet = useMindWallet(mindId).data
  const catalog = useSkillCatalog()
  const demo = useIsTryOut()
  const [watching, setWatching] = useState<ApiConnection["toolkit"] | null>(null)
  const connections = useConnections({ watching }).data
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [category, setCategory] = useState<CategoryId | "all">("all")
  // Nine a page, a 3 by 3 grid on desktop (Ancung, 11 Nov); a new tab, filter or search starts at page 1.
  const [page, setPage] = useState(1)
  const listTop = useRef<HTMLDivElement>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [opened, setOpened] = useState(0)

  const name = mind?.name ?? "Your Mind"
  const equipped = mind?.skills ?? []
  const ctx = {
    name,
    limit: wallet?.policy?.perTransactionNear ?? null,
    apps: Object.fromEntries((connections ?? []).map((c) => [c.toolkit, c.status])),
    tryOut: demo,
  }
  const skills = catalog.data ?? []
  const shown = skills
    .filter((s) => matchesSearch(s.skillId, query))
    .filter((s) => (filter === "added" ? equipped.includes(s.skillId) : filter === "not_added" ? !equipped.includes(s.skillId) : true))
    .filter((s) => category === "all" || categoryOf(s.skillId) === category)
  // In group order (Money first), with no heading inside a tab (Ancung, 11 Nov: the tab names it).
  const ordered = byCategory(shown).flatMap((g) => g.skills)
  const pages = pageCount(ordered.length, PER_PAGE)
  const current = Math.min(page, pages)
  const pageItems = ordered.slice((current - 1) * PER_PAGE, current * PER_PAGE)
  const goTo = (n: number) => {
    setPage(n)
    listTop.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" })
  }
  // Try-out users get a sample inbox and calendar, so nothing needs connecting for them.
  const needsConnecting = (s: ApiSkill) => {
    const app = skillCopy(s.skillId).needs
    return !demo && Boolean(app) && connectionStatus(connections, app!) !== "connected"
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 xl:p-8">
      <PageTitle
        title="Skills"
        description={`Teach ${name} new things. Every skill says what it can touch and spend.`}
        actions={
          <div className="relative w-full md:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="skill-search" className="sr-only">
              Search skills
            </label>
            <input
              id="skill-search"
              type="search"
              value={query}
              onChange={(e) => (setQuery(e.target.value), setPage(1))}
              placeholder="Search skills"
              className="h-11 w-full rounded-full border border-input bg-surface pr-4 pl-10 text-base text-foreground outline-none placeholder:text-tertiary-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-[15px]"
            />
          </div>
        }
      />

      {/* What a skill is for: a line tab bar, so it reads as the page's sections and the Added /
          Not added pills below read as a filter inside them (Ancung, 11 Nov). Scrolls sideways on phones. */}
      <Tabs value={category} onValueChange={(v) => (setCategory(v as CategoryId | "all"), setPage(1))}>
        <div className="relative -mx-4 border-b border-border md:mx-0">
          {/* Phones: no scrollbar under the tabs (it read like the active line), a fade at the right
              edge says more tabs are a swipe away (Ancung, 11 Nov). */}
          <div className="scrollbar-none overflow-x-auto px-4 md:px-0">
            <TabsList variant="line" aria-label="Kind of skill" className="w-max gap-5 p-0 pb-[5px]">
              {([{ id: "all", label: "All skills" }, ...CATEGORIES] as const).map((c) => (
                <TabsTrigger key={c.id} value={c.id} className="flex-none px-0.5 py-2">
                  {c.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent md:hidden" />
        </div>
      </Tabs>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => (setFilter(v as Filter), setPage(1))}>
          <TabsList className="border border-border">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="added">Added</TabsTrigger>
            <TabsTrigger value="not_added">Not added</TabsTrigger>
          </TabsList>
        </Tabs>
        {catalog.data && (
          <span className="text-[13px] text-muted-foreground">
            {skills.filter((s) => equipped.includes(s.skillId)).length} of {skills.length} added
          </span>
        )}
      </div>

      {catalog.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : catalog.isError ? (
        <ErrorRetry
          className="rounded-lg border border-border bg-surface p-5"
          message={`Could not load the skill list. ${name} keeps the skills it already has; only the list is missing.`}
          onRetry={() => void catalog.refetch()}
        />
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-foreground">{query.trim() ? `No skills match "${query.trim()}"` : "No skills found"}</p>
          <p className="text-sm text-muted-foreground">
            {query.trim() ? `Try another word. ${name} can learn: ${skills.map((s) => skillCopy(s.skillId).title).join(", ")}.` : "Try another filter."}
          </p>
        </div>
      ) : (
        <div ref={listTop} className="flex scroll-mt-6 flex-col gap-6">
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((s) => (
              <SkillCard
                key={s.skillId}
                mindId={mindId}
                skill={s}
                added={equipped.includes(s.skillId)}
                needsConnecting={needsConnecting(s)}
                ctx={ctx}
                onAdd={() => {
                  setOpened((n) => n + 1)
                  setAdding(s.skillId)
                }}
              />
            ))}
          </ul>
          <Pager page={current} pages={pages} onPage={goTo} label="Skill pages" />
        </div>
      )}

      {adding && (
        <AddSkillDialog
          key={opened}
          mindId={mindId}
          skillId={adding}
          skills={equipped}
          ctx={ctx}
          needsConnecting={Boolean(skills.find((s) => s.skillId === adding) && needsConnecting(skills.find((s) => s.skillId === adding)!))}
          open={Boolean(adding)}
          onOpenChange={(o) => !o && setAdding(null)}
          onConnecting={() => setWatching(skillCopy(adding).needs ?? null)}
        />
      )}
    </div>
  )
}

function SkillCard({
  mindId,
  skill,
  added,
  needsConnecting,
  ctx,
  onAdd,
}: {
  mindId: string
  skill: ApiSkill
  added: boolean
  needsConnecting: boolean
  ctx: Parameters<typeof skillLines>[1]
  onAdd: () => void
}) {
  const copy = skillCopy(skill.skillId)
  const Icon = SKILL_ICON[skill.skillId] ?? PlugIcon
  const blocked = skill.status === "blocked"
  const app = copy.needs ? TOOLKIT_NAME[copy.needs] : null
  const lines = skillLines(skill.skillId, ctx)

  return (
    <li className={cn("flex flex-col gap-4 rounded-lg border border-border bg-surface p-5", blocked && "opacity-70")}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="size-5 text-foreground" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-[15px] font-semibold text-foreground">{copy.title}</h2>
          <span className="text-xs text-muted-foreground">by HelloNear</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{blocked ? "Turned off for now. Nothing you saved is affected." : copy.blurb}</p>
      {lines.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Can use</p>
          <SkillLines mindId={mindId} lines={lines} />
        </div>
      )}
      {/* Wraps instead of overflowing (Ancung, 11 Nov: "Connect Google Sheets" ran out of the card at 100% zoom). */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
        {blocked ? (
          <Badge variant="neutral">Not available</Badge>
        ) : added ? (
          <Badge variant="success">
            <CheckIcon />
            Added
          </Badge>
        ) : (
          // The button says which app it needs; the badge doesn't repeat it.
          <Badge variant="neutral">Not added</Badge>
        )}
        {blocked ? null : added ? (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${mindHref(mindId, "skills")}/${skill.skillId}`} />}>
            Settings
          </Button>
        ) : (
          <Button size="sm" className="max-w-full min-w-0" onClick={onAdd}>
            <span className="truncate">{needsConnecting && app ? `Connect ${app}` : "Add"}</span>
          </Button>
        )}
      </div>
    </li>
  )
}
