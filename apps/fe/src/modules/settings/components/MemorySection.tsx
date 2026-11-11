"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { isApiCode } from "@/lib/api"
import { mindKeys } from "@/lib/queryKeys"
import { mindsApi, type ApiMind } from "@/modules/minds/api"
import { MEMORY_MAX_CHARS, memoryApi } from "@/modules/settings/api"
import { memorySections, updatedLine } from "@/modules/settings/data/memory"

type Switches = { enabled: boolean; recall: boolean }

/**
 * Memory in Mind settings (#209): the two switches the engine reads on every run, what the Mind
 * remembers about its owner (the working memory of its current name and voice, grouped by the
 * document's own headings), Edit (`PUT`, the whole document) and Clear all memory (asks first).
 * Try-out users can read it and use the switches; editing and clearing are refused for them.
 */
export function MemorySection({ mind, name, tryOut }: { mind: ApiMind; name: string; tryOut: boolean }) {
  const mindId = mind.id
  const queryClient = useQueryClient()
  const switches: Switches = mind.memory ?? { enabled: true, recall: true }
  const memory = useQuery({ queryKey: mindKeys.memory(mindId), queryFn: () => memoryApi.get(mindId) })
  const [draft, setDraft] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const toggle = useMutation({
    mutationFn: (next: Partial<Switches>) => mindsApi.update(mindId, { memory: next }),
    onSuccess: (next) => queryClient.setQueryData(mindKeys.full(mindId), next),
    onError: () => toast.error("Could not change the memory setting", { description: "No changes were made. Please try again later." }),
  })

  const save = useMutation({
    mutationFn: (markdown: string) => memoryApi.replace(mindId, markdown),
    onSuccess: (next) => {
      queryClient.setQueryData(mindKeys.memory(mindId), next)
      setDraft(null)
      toast.success("Memory saved")
    },
    onError: (err) =>
      toast.error("Could not save the memory", {
        description: isApiCode(err, "demo_not_allowed") ? "A try-out Mind's memory can be read but not changed." : "No changes were made. Please try again later.",
      }),
  })

  const clear = useMutation({
    mutationFn: () => memoryApi.clear(mindId),
    onSuccess: () => {
      queryClient.setQueryData(mindKeys.memory(mindId), { markdown: "", updatedAt: null })
      setConfirmClear(false)
      setDraft(null)
      toast.success("Memory cleared")
    },
    onError: (err) =>
      toast.error("Could not clear the memory", {
        description: isApiCode(err, "demo_not_allowed") ? "A try-out Mind's memory can be read but not changed." : "No changes were made. Please try again later.",
      }),
  })

  const markdown = memory.data?.markdown ?? ""
  const sections = memorySections(markdown)
  const busy = toggle.isPending

  return (
    <section aria-labelledby="memory-title" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 id="memory-title" className="text-[15px] font-semibold text-foreground">
          Memory
        </h2>
        <p className="text-[13px] text-muted-foreground">What {name} keeps about you between chats. A new name or voice starts a fresh memory.</p>
      </div>

      <SwitchRow
        id="memory-enabled"
        title="Remember things about you"
        description={`${name} keeps notes about you and uses them in every chat. Off: it neither reads nor writes them.`}
        checked={switches.enabled}
        disabled={busy}
        onChange={(enabled) => toggle.mutate({ enabled })}
      />
      <SwitchRow
        id="memory-recall"
        title="Search past chats"
        description={`${name} looks up what was said in your other chats. Off: chats held meanwhile are not found later either.`}
        checked={switches.recall}
        disabled={busy}
        onChange={(recall) => toggle.mutate({ recall })}
      />

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 text-sm font-medium text-foreground">What {name} remembers</h3>
          {!tryOut && draft === null && memory.isSuccess && (
            <Button variant="ghost" size="sm" onClick={() => setDraft(markdown)}>
              <PencilIcon />
              Edit
            </Button>
          )}
        </div>

        {memory.isPending ? (
          <Skeleton className="h-24 w-full rounded-md" />
        ) : memory.isError ? (
          <p className="text-[13px] text-danger">Could not load the memory. Please try again later.</p>
        ) : draft !== null ? (
          <div className="flex flex-col gap-2 animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none">
            <Textarea
              value={draft}
              rows={10}
              maxLength={MEMORY_MAX_CHARS}
              aria-label={`What ${name} remembers, as Markdown`}
              className="text-[13px]"
              onChange={(e) => setDraft(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Markdown. Headings (# You) group the notes. Saving replaces the whole memory.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button onClick={() => save.mutate(draft)} disabled={save.isPending || draft === markdown}>
                {save.isPending && <Spinner />}
                Save
              </Button>
            </div>
          </div>
        ) : sections.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nothing remembered yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {sections.map((section, i) => (
              <div key={`${section.title ?? ""}-${i}`} className="flex flex-col gap-1.5">
                {section.title && <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h4>}
                <ul className="flex flex-col gap-1">
                  {section.rows.map((row, j) => (
                    <li key={j} className="rounded-md bg-muted px-3 py-2 text-[13px] text-foreground">
                      {row}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {memory.data?.updatedAt && <p className="text-xs text-muted-foreground">{updatedLine(memory.data.updatedAt)}</p>}
          </div>
        )}

        {tryOut ? (
          <p className="text-xs text-muted-foreground">A try-out Mind&apos;s memory can be read but not changed.</p>
        ) : (
          draft === null &&
          markdown && (
            <Button variant="outline" className="w-fit text-danger" onClick={() => setConfirmClear(true)}>
              <Trash2Icon />
              Clear all memory
            </Button>
          )
        )}
      </div>

      <Dialog open={confirmClear} onOpenChange={(open) => !clear.isPending && setConfirmClear(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all of {name}&apos;s memory?</DialogTitle>
            <DialogDescription>
              {name} forgets everything it noted about you. Your chats stay, and {name} can still find them while Search past chats is on. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)} disabled={clear.isPending}>
              Keep memory
            </Button>
            <Button variant="destructive" onClick={() => clear.mutate()} disabled={clear.isPending}>
              {clear.isPending && <Spinner />}
              Clear all memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function SwitchRow({ id, title, description, checked, disabled, onChange }: { id: string; title: string; description: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {title}
        </label>
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} aria-describedby={`${id}-hint`} onCheckedChange={onChange} />
    </div>
  )
}
