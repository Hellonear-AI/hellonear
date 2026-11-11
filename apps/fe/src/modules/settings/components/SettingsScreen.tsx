"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Spinner } from "@/components/elements/Spinner"
import { ChoiceSelect } from "@/components/elements/ChoiceSelect"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { PageTitle } from "@/components/elements/PageTitle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { isApiCode } from "@/lib/api"
import { mindsApi, type ApiMind } from "@/modules/minds/api"
import { templateLabel } from "@/modules/minds/data/minds"
import { isValidMindName, NAME_RULE } from "@/modules/minds/data/templates"
import { mindKeys, useFullMind, useMind, useMindWallet, useTemplates } from "@/modules/minds/hooks/useMinds"
import { useIsTryOut } from "@/modules/auth/hooks/useSession"
import { DeleteMindDialog } from "@/modules/settings/components/DeleteMindDialog"
import { MemorySection } from "@/modules/settings/components/MemorySection"

const IDENTITY_MAX = 1000

/** "zai-org/GLM-4.6" -> "GLM-4.6". */
const modelName = (id: string) => id.split("/").pop() ?? id

/**
 * Mind settings (design M1.1 to M1.4): how the Mind is named, talks and thinks, and deleting it.
 * Spending rules live in Wallet. `PATCH /minds/{id}` saves; a new name or voice starts a fresh
 * memory on the engine side (#116), which the page says before saving.
 */
export function SettingsScreen({ mindId }: { mindId: string }) {
  const queryClient = useQueryClient()
  const shell = useMind(mindId).data
  const wallet = useMindWallet(mindId).data
  const full = useFullMind(mindId)
  const templates = useTemplates()

  const mind = full.data
  const [draft, setDraft] = useState<{ name: string; identity: string; model: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tryOut = useIsTryOut()
  const saved = mind ? { name: mind.name, identity: mind.soul.identity, model: mind.model } : null
  const form = draft ?? saved
  const name = shell?.name ?? mind?.name ?? "Your Mind"

  const nameOk = form ? isValidMindName(form.name) : true
  const changed = Boolean(form && saved && (form.name.trim() !== saved.name || form.identity.trim() !== saved.identity || form.model !== saved.model))
  const persona = Boolean(form && saved && (form.name.trim() !== saved.name || form.identity.trim() !== saved.identity))

  const save = useMutation({
    mutationFn: async () => {
      if (!mind || !form) throw new Error("not_loaded")
      const body: Partial<Pick<ApiMind, "name" | "soul" | "model">> = {}
      if (form.name.trim() !== mind.name) body.name = form.name.trim()
      if (form.identity.trim() !== mind.soul.identity) body.soul = { ...mind.soul, identity: form.identity.trim() }
      if (form.model !== mind.model) body.model = form.model
      return mindsApi.update(mindId, body)
    },
    onSuccess: (next) => {
      queryClient.setQueryData(mindKeys.full(mindId), next)
      setDraft(null)
      toast.success("Settings saved", { description: persona ? `New chats use ${next.name}'s new name and voice.` : undefined })
    },
    onError: (err) =>
      toast.error("Could not save the settings", {
        description: isApiCode(err, "demo_not_allowed") ? "A try-out Mind can't be changed. Connect a wallet to make your own." : "Please try again later.",
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: mindKeys.all }),
  })

  // The models the templates use: each is known to work with the tools.
  const models = [...new Set([...(templates.data ?? []).map((t) => t.model), ...(mind ? [mind.model] : [])])]

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 pb-28 md:px-10 md:py-10">
      <PageTitle title={`${name}'s settings`} description={`How ${name} is named, talks and thinks. Spending rules live in Wallet.`} />

      {full.isPending || !form || !mind ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : (
        <>
          <section aria-labelledby="name-title" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-4">
              <MindAvatar templateId={mind.templateId} size={64} />
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span id="name-title" className="text-sm font-medium text-foreground">
                  Name
                </span>
                <Input
                  value={form.name}
                  maxLength={24}
                  aria-invalid={!nameOk}
                  onChange={(e) => setDraft({ ...form, name: e.target.value })}
                />
              </label>
            </div>
            <p className={nameOk ? "text-xs text-muted-foreground" : "text-xs text-danger"}>
              {nameOk ? `${templateLabel(mind.templateId)}. The template can't change; make a new Mind for a different job.` : NAME_RULE}
            </p>
          </section>

          <section aria-labelledby="voice-title" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
            <h2 id="voice-title" className="text-[15px] font-semibold text-foreground">
              How {name} talks
            </h2>
            <Textarea
              value={form.identity}
              maxLength={IDENTITY_MAX}
              rows={5}
              aria-labelledby="voice-title"
              onChange={(e) => setDraft({ ...form, identity: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Its safety rules stay as they are and can&apos;t be edited here. A new name or voice starts a fresh memory, so {name} forgets what it learned about you; old chats stay.
            </p>
          </section>

          <section aria-labelledby="model-title" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
            <h2 id="model-title" className="text-[15px] font-semibold text-foreground">
              How {name} thinks
            </h2>
            <ChoiceSelect aria-label="Model" value={form.model} onChange={(model) => setDraft({ ...form, model })} options={models.map((m) => ({ value: m, label: modelName(m) }))} />
            <p className="text-xs text-muted-foreground">
              Change the model and {name} stays {name}: same name, voice and memory. Replies get a badge only when NEAR AI can prove where they ran.
            </p>
          </section>

          <MemorySection mind={mind} name={name} tryOut={tryOut} />

          <section aria-labelledby="delete-title" className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-surface p-5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 id="delete-title" className="text-[15px] font-semibold text-danger">
                Delete {name}
              </h2>
              <p className="text-[13px] text-muted-foreground">Removes {name}, its chats, memory and Autopilot jobs. This can&apos;t be undone.</p>
            </div>
            <Button variant="outline" className="w-fit text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon />
              Delete {name}
            </Button>
          </section>
        </>
      )}

      {/* M1.2: what changed, with Discard and Save, kept at the bottom while there are changes. */}
      {changed && form && (
        <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-md animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm text-foreground">
            {persona ? `You changed ${name}'s ${form.name.trim() !== saved?.name ? "name" : "voice"}. Saving starts a fresh memory.` : `You changed how ${name} thinks.`}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
              Discard
            </Button>
            <Button onClick={() => save.mutate()} disabled={!nameOk || !form.identity.trim() || save.isPending}>
              {save.isPending && <Spinner />}
              Save
            </Button>
          </div>
        </div>
      )}

      {/* M1.4 */}
      <DeleteMindDialog mindId={mindId} name={name} wallet={wallet} tryOut={tryOut} open={confirmDelete} onOpenChange={setConfirmDelete} />
    </div>
  )
}
