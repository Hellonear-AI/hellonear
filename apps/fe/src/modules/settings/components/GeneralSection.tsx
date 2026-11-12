"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { ChoiceSelect } from "@/components/elements/ChoiceSelect"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { isApiCode } from "@/lib/api"
import { mindsApi, type ApiMind } from "@/modules/minds/api"
import { templateLabel } from "@/modules/minds/data/minds"
import { isValidMindName, NAME_RULE } from "@/modules/minds/data/templates"
import { mindKeys, useTemplates } from "@/modules/minds/hooks/useMinds"
import type { ApiWallet } from "@/modules/wallet/api"
import { DeleteMindDialog } from "@/modules/settings/components/DeleteMindDialog"
import { SaveBar, SettingsGroup, SettingsRow } from "@/modules/settings/components/SettingsParts"

const IDENTITY_MAX = 1000

/** "zai-org/GLM-4.6" -> "GLM-4.6". */
const modelName = (id: string) => id.split("/").pop() ?? id

/**
 * General (design M1.1 to M1.4): how the Mind is named, talks and thinks, and deleting it.
 * `PATCH /minds/{id}` saves from the bar; a new name or voice starts a fresh memory on the engine
 * side (#116), which the bar says before saving.
 */
export function GeneralSection({ mind, name, wallet, tryOut }: { mind: ApiMind; name: string; wallet: ApiWallet | null | undefined; tryOut: boolean }) {
  const queryClient = useQueryClient()
  const templates = useTemplates()
  const [draft, setDraft] = useState<{ name: string; identity: string; model: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const saved = { name: mind.name, identity: mind.soul.identity, model: mind.model }
  const form = draft ?? saved

  const nameOk = isValidMindName(form.name)
  const changed = form.name.trim() !== saved.name || form.identity.trim() !== saved.identity || form.model !== saved.model
  const persona = form.name.trim() !== saved.name || form.identity.trim() !== saved.identity

  const save = useMutation({
    mutationFn: async () => {
      const body: Partial<Pick<ApiMind, "name" | "soul" | "model">> = {}
      if (form.name.trim() !== mind.name) body.name = form.name.trim()
      if (form.identity.trim() !== mind.soul.identity) body.soul = { ...mind.soul, identity: form.identity.trim() }
      if (form.model !== mind.model) body.model = form.model
      return mindsApi.update(mind.id, body)
    },
    onSuccess: (next) => {
      queryClient.setQueryData(mindKeys.full(mind.id), next)
      setDraft(null)
      toast.success("Settings saved", { description: persona ? `New chats use ${next.name}'s new name and voice.` : undefined })
    },
    onError: (err) =>
      toast.error("Could not save the settings", {
        description: isApiCode(err, "demo_not_allowed") ? "A guest Mind can't be changed. Connect a wallet to make your own." : "Please try again later.",
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: mindKeys.all }),
  })

  // The models the templates use: each is known to work with the tools.
  const models = [...new Set([...(templates.data ?? []).map((t) => t.model), mind.model])]

  return (
    <>
      <SettingsGroup>
        <SettingsRow
          label="Name"
          htmlFor="mind-name"
          description={nameOk ? `${templateLabel(mind.templateId)}. The template can't change; make a new Mind for a different job.` : <span className="text-danger">{NAME_RULE}</span>}
          control={<MindAvatar templateId={mind.templateId} size={40} />}
          below={<Input id="mind-name" value={form.name} maxLength={24} aria-invalid={!nameOk} onChange={(e) => setDraft({ ...form, name: e.target.value })} />}
        />
        <SettingsRow
          label={`How ${name} talks`}
          htmlFor="mind-voice"
          description={`Its safety rules stay as they are and can't be edited here. A new name or voice starts a fresh memory, so ${name} forgets what it learned about you; old chats stay.`}
          below={<Textarea id="mind-voice" value={form.identity} maxLength={IDENTITY_MAX} rows={5} onChange={(e) => setDraft({ ...form, identity: e.target.value })} />}
        />
        <SettingsRow
          label={`How ${name} thinks`}
          description={`Change the model and ${name} stays ${name}: same name, voice and memory. Replies get a badge only when NEAR AI can prove where they ran.`}
          below={
            <ChoiceSelect aria-label="Model" value={form.model} onChange={(model) => setDraft({ ...form, model })} options={models.map((m) => ({ value: m, label: modelName(m) }))} />
          }
        />
      </SettingsGroup>

      <SettingsGroup className="mt-8">
        <SettingsRow
          tone="danger"
          label={`Delete ${name}`}
          description={`Removes ${name}, its chats, memory and Autopilot jobs. This can't be undone.`}
          control={
            <Button variant="outline" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon />
              Delete
            </Button>
          }
        />
      </SettingsGroup>

      {/* M1.2: what changed, with Discard and Save, kept at the bottom while there are changes. */}
      {changed && (
        <SaveBar
          message={persona ? `You changed ${name}'s ${form.name.trim() !== saved.name ? "name" : "voice"}. Saving starts a fresh memory.` : `You changed how ${name} thinks.`}
        >
          <Button variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
            Discard
          </Button>
          <Button onClick={() => save.mutate()} disabled={!nameOk || !form.identity.trim() || save.isPending}>
            {save.isPending && <Spinner />}
            Save
          </Button>
        </SaveBar>
      )}

      {/* M1.4 */}
      <DeleteMindDialog mindId={mind.id} name={name} wallet={wallet} tryOut={tryOut} open={confirmDelete} onOpenChange={setConfirmDelete} />
    </>
  )
}
