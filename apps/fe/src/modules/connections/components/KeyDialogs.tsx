"use client"

import { CheckIcon, XIcon } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { cn } from "cn"
import { Spinner } from "@/components/elements/Spinner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { isApiCode } from "@/lib/api"
import type { ApiSecret } from "@/modules/connections/api"
import { keyNameError, keyValueError, parseHosts } from "@/modules/connections/data/keys"
import { useDeleteSecret, useDisconnect, useSaveSecret } from "@/modules/connections/hooks/useKeys"
import type { ApiConnection } from "@/modules/minds/api"
import { TOOLKIT_NAME } from "@/modules/skills/data/skills"

function Field({ label, help, error, children, id }: { label: string; help: string; error: string | null; children: ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      <p className={cn("text-xs", error ? "text-danger" : "text-muted-foreground")}>{error ?? help}</p>
    </div>
  )
}

/**
 * K1.5 Add a key, or K2.1 Replace one (`existing` set): the name stays, the old value is never
 * shown so the field starts empty, and the sites can change. No wallet signature.
 * The parent gives it a new `key` per opening.
 */
export function KeyDialog({
  mindName,
  existing,
  taken,
  open,
  onOpenChange,
  onSaved,
}: {
  mindName: string
  existing: ApiSecret | null
  /** Names already saved, so a new key can't silently replace one. */
  taken: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (name: string) => void
}) {
  const save = useSaveSecret()
  const [name, setName] = useState(existing?.name ?? "")
  const [value, setValue] = useState("")
  const [hosts, setHosts] = useState(existing?.allowedHosts.join("\n") ?? "")
  const ids = { name: useId(), value: useId(), hosts: useId() }
  const busy = save.isPending

  const nameError = existing ? null : keyNameError(name, taken)
  const valueError = keyValueError(value)
  const parsed = parseHosts(hosts)
  const ready = (existing || (name.trim() && !nameError)) && value.length >= 4 && !valueError && parsed.hosts.length > 0 && !parsed.error

  function submit() {
    if (!ready || busy) return
    const keyName = existing?.name ?? name.trim()
    save.mutate(
      { name: keyName, value, allowedHosts: parsed.hosts },
      {
        onSuccess: () => {
          onOpenChange(false)
          onSaved(keyName)
          toast.success("Key saved", { description: `Sent only to ${parsed.hosts.join(", ")}.` })
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} disablePointerDismissal={busy}>
      <DialogContent showCloseButton={!busy} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? `Replace ${existing.name}` : "Add a key"}</DialogTitle>
          <DialogDescription>
            {existing
              ? "Paste the new key. The old one is deleted when you save, and the new one is hidden too."
              : "For a service of your own. You won't be able to see the key again after saving."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="key-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <fieldset disabled={busy} className="flex flex-col gap-4">
            {!existing && (
              <Field id={ids.name} label="Name" help={`Capital letters and _ only, so ${mindName} can refer to it.`} error={nameError}>
                <Input
                  id={ids.name}
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase().replace(/[\s-]+/g, "_"))}
                  placeholder="SHOP_API_KEY"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(nameError) || undefined}
                />
              </Field>
            )}
            <Field id={ids.value} label={existing ? "New key" : "Key"} help="Paste it here. It's hidden as you type." error={valueError}>
              <Input
                id={ids.value}
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={existing ? "Paste the new key" : undefined}
                autoComplete="new-password"
                spellCheck={false}
                aria-invalid={Boolean(valueError) || undefined}
              />
            </Field>
            <Field
              id={ids.hosts}
              label="Only send it to"
              help={existing ? "Change this only if the service moved." : `One site per line. ${mindName} can't send the key anywhere else.`}
              error={parsed.error}
            >
              <Textarea
                id={ids.hosts}
                value={hosts}
                onChange={(e) => setHosts(e.target.value)}
                placeholder="api.example.com"
                rows={2}
                spellCheck={false}
                autoCapitalize="none"
                className="min-h-0"
                aria-invalid={Boolean(parsed.error) || undefined}
              />
            </Field>
            {save.error && (
              <p role="alert" className="text-[13px] text-danger">
                {isApiCode(save.error, "demo_not_allowed")
                  ? "Connect a wallet to save keys. This try-out can't keep them."
                  : "Could not save the key. No changes were made. Please try again."}
              </p>
            )}
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="key-form" disabled={!ready || busy}>
            {busy && <Spinner />}
            {existing ? "Save new key" : "Save key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Consequences({ items }: { items: { ok: boolean; t: string }[] }) {
  return (
    <ul className="flex flex-col gap-1.5 rounded-md bg-muted px-4 py-3">
      {items.map(({ ok, t }) => (
        <li key={t} className="flex items-start gap-2 text-[13px] text-foreground">
          {ok ? <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" /> : <XIcon className="mt-0.5 size-3.5 shrink-0 text-danger" />}
          {t}
        </li>
      ))}
    </ul>
  )
}

/** K2.2: says what fails, so nothing breaks by surprise. Focus starts on "Keep it". */
export function DeleteKeyDialog({ mindName, secret, open, onOpenChange }: { mindName: string; secret: ApiSecret; open: boolean; onOpenChange: (open: boolean) => void }) {
  const del = useDeleteSecret()
  const busy = del.isPending
  const sites = secret.allowedHosts.join(", ")
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} disablePointerDismissal={busy}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Delete {secret.name}?</DialogTitle>
          <DialogDescription>
            {mindName} won&apos;t be able to call {sites} with it any more.
          </DialogDescription>
        </DialogHeader>
        <Consequences
          items={[
            { ok: false, t: "Other apps can't use it" },
            { ok: false, t: "Jobs that use it will stop with an error" },
            { ok: true, t: "Other keys keep working" },
          ]}
        />
        <p className="text-xs text-muted-foreground">You can add it again later with the same name.</p>
        {del.error && (
          <p role="alert" className="text-[13px] text-danger">
            Could not delete the key. No changes were made. Please try again.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" autoFocus disabled={busy} onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              del.mutate(secret.name, {
                onSuccess: () => {
                  onOpenChange(false)
                  toast("Key deleted", { description: secret.name })
                },
              })
            }
          >
            {busy && <Spinner />}
            Delete key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** K2.3: what stops and what stays. Reconnecting later is one tap. */
export function DisconnectDialog({
  mindName,
  toolkit,
  open,
  onOpenChange,
}: {
  mindName: string
  toolkit: ApiConnection["toolkit"]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const disconnect = useDisconnect()
  const busy = disconnect.isPending
  const app = TOOLKIT_NAME[toolkit]
  const items =
    toolkit === "gmail"
      ? [
          { ok: false, t: "Email helper can't read or sort your mail" },
          { ok: false, t: `${mindName} can't save new drafts` },
          { ok: true, t: "Drafts already in Gmail stay there" },
        ]
      : toolkit === "googlemeet"
        ? [
            { ok: false, t: "Daily planner can't add video links to new meetings" },
            { ok: true, t: "Meetings already scheduled keep their links" },
          ]
        : [
            { ok: false, t: "Daily planner can't read or add events" },
            { ok: true, t: "Events already in your calendar stay there" },
          ]
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} disablePointerDismissal={busy}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Disconnect {app}?</DialogTitle>
          <DialogDescription>HelloNear&apos;s access to your {app} is removed right away.</DialogDescription>
        </DialogHeader>
        <Consequences items={items} />
        <p className="text-xs text-muted-foreground">You can connect {app} again any time from this page.</p>
        {disconnect.error && (
          <p role="alert" className="text-[13px] text-danger">
            Could not disconnect {app}. No changes were made. Please try again.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" autoFocus disabled={busy} onClick={() => onOpenChange(false)}>
            Keep connected
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              disconnect.mutate(toolkit, {
                onSuccess: () => {
                  onOpenChange(false)
                  toast(`${app} disconnected`)
                },
              })
            }
          >
            {busy && <Spinner />}
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
