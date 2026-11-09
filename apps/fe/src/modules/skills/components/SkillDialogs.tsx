"use client"

import { CheckIcon, ExternalLinkIcon, Loader2Icon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { skillCopy, TOOLKIT_NAME } from "@/modules/skills/data/skills"
import { useConnect, useSetSkills } from "@/modules/skills/hooks/useSkills"

type Ctx = { name: string; limit: string | null }

function Lines({ title, items, ok }: { title: string; items: string[]; ok: boolean }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((t) => (
          <li key={t} className="flex items-start gap-2 text-[13px] text-foreground">
            {ok ? <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" /> : <XIcon className="mt-0.5 size-3.5 shrink-0 text-danger" />}
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Add a skill (S2.1 ask, S2.4 added) or, when it can't work without an app, connect that app
 * first (S2.2). Focus starts on "Not now". No wallet signature: skills change the Mind's config.
 * The parent gives it a new `key` per opening.
 */
export function AddSkillDialog({
  mindId,
  skillId,
  skills,
  ctx,
  needsConnecting,
  open,
  onOpenChange,
  onConnecting,
}: {
  mindId: string
  skillId: string
  /** The Mind's skills now; the new one is added to these. */
  skills: string[]
  ctx: Ctx
  /** The app this skill needs isn't connected yet. */
  needsConnecting: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once the connect window opened, so the page can watch for the result. */
  onConnecting: () => void
}) {
  const copy = skillCopy(skillId)
  const setSkills = useSetSkills(mindId)
  const connect = useConnect()
  const [added, setAdded] = useState(false)
  const busy = setSkills.isPending || connect.isPending
  const app = copy.needs ? TOOLKIT_NAME[copy.needs] : null

  function close(next: boolean) {
    if (!next && busy) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close} disablePointerDismissal={busy}>
      <DialogContent showCloseButton={!busy}>
        {added ? (
          <>
            <DialogHeader>
              <span className="mb-1 flex size-10 items-center justify-center rounded-md bg-success-soft">
                <CheckIcon className="size-5 text-success" />
              </span>
              <DialogTitle>{copy.title} is on</DialogTitle>
              <DialogDescription>{copy.added(ctx)}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{needsConnecting && app ? `Connect ${app} first` : `Let ${ctx.name} use ${copy.title}?`}</DialogTitle>
              <DialogDescription>
                {needsConnecting && app ? `${copy.title} works with your ${app}. Connect ${app}, then come back to allow it.` : copy.ask.why(ctx)}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 rounded-md bg-muted px-4 py-3">
              <Lines title="What it will do" items={copy.ask.does(ctx)} ok />
              <Lines title="Never" items={copy.ask.never(ctx)} ok={false} />
            </div>
            {setSkills.error || connect.error ? (
              <p role="alert" className="text-[13px] text-danger">
                {connect.error ? `Couldn't open ${app}. Nothing changed; try again in a moment.` : `Couldn't add ${copy.title}. Nothing changed; try again.`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {needsConnecting && app ? `${app} opens in a new window. HelloNear never sees your Google password.` : copy.ask.note}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" autoFocus disabled={busy} onClick={() => close(false)}>
                Not now
              </Button>
              {needsConnecting && app ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    connect.mutate(copy.needs!, {
                      onSuccess: () => {
                        onConnecting()
                        onOpenChange(false)
                      },
                    })
                  }
                >
                  {connect.isPending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <ExternalLinkIcon />}
                  Connect {app}
                </Button>
              ) : (
                <Button disabled={busy} onClick={() => setSkills.mutate([...skills, skillId], { onSuccess: () => setAdded(true) })}>
                  {setSkills.isPending && <Loader2Icon className="animate-spin motion-reduce:animate-none" />}
                  Add skill
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** S2.5: what stops and what stays. Focus starts on "Keep it". */
export function RemoveSkillDialog({
  mindId,
  skillId,
  skills,
  ctx,
  open,
  onOpenChange,
  onRemoved,
}: {
  mindId: string
  skillId: string
  skills: string[]
  ctx: Ctx
  open: boolean
  onOpenChange: (open: boolean) => void
  onRemoved?: () => void
}) {
  const copy = skillCopy(skillId)
  const setSkills = useSetSkills(mindId)
  const busy = setSkills.isPending
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} disablePointerDismissal={busy}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Remove {copy.title}?</DialogTitle>
          <DialogDescription>{copy.removed(ctx)}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          No signature needed. You can add it again any time. An Autopilot job that uses it will pause.
        </p>
        {setSkills.error && (
          <p role="alert" className="text-[13px] text-danger">
            Couldn&apos;t remove {copy.title}. Nothing changed; try again.
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
              setSkills.mutate(
                skills.filter((s) => s !== skillId),
                {
                  onSuccess: () => {
                    onOpenChange(false)
                    toast(`${copy.title} removed`)
                    onRemoved?.()
                  },
                }
              )
            }
          >
            {busy && <Loader2Icon className="animate-spin motion-reduce:animate-none" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
