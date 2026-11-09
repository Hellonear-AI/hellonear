"use client"

import { CheckIcon, ExternalLinkIcon, KeyRoundIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { cn } from "cn"
import { GmailLogo, GoogleCalendarLogo } from "@/components/elements/AppLogos"
import { PageTitle } from "@/components/elements/PageTitle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { shortWhen } from "@/lib/format"
import { TryOutLockedDialog, useTryOutLock } from "@/modules/auth/components/TryOutLockedDialog"
import { useSession } from "@/modules/auth/hooks/useSession"
import type { ApiSecret } from "@/modules/connections/api"
import { DeleteKeyDialog, DisconnectDialog, KeyDialog } from "@/modules/connections/components/KeyDialogs"
import { useSecrets, useDisconnect } from "@/modules/connections/hooks/useKeys"
import type { ApiConnection } from "@/modules/minds/api"
import { useMind } from "@/modules/minds/hooks/useMinds"
import { TOOLKIT_NAME } from "@/modules/skills/data/skills"
import { connectionStatus, useConnect, useConnections } from "@/modules/skills/hooks/useSkills"

const APPS: { toolkit: ApiConnection["toolkit"]; logo: ReactNode; uses: string; needs: string }[] = [
  { toolkit: "gmail", logo: <GmailLogo />, uses: "Used by Email helper to read mail and save drafts.", needs: "Email helper needs it to read your mail and save drafts." },
  {
    toolkit: "googlecalendar",
    logo: <GoogleCalendarLogo />,
    uses: "Used by Daily planner to read your events and add new ones.",
    needs: "Daily planner uses it to read your events and add new ones.",
  },
]

type Open = { kind: "add" } | { kind: "replace"; secret: ApiSecret } | { kind: "delete"; secret: ApiSecret } | { kind: "disconnect"; toolkit: ApiConnection["toolkit"] } | null

/**
 * Connections (design "6 · Skills and apps", K1, K2): the apps and keys the Mind can use, for the
 * whole account. Apps connect through Composio in a new window and this page updates by itself
 * (K1.3); keys are only ever shown as dots, with replace and delete as the only actions.
 * The design shows Gmail only; Google Calendar (#57) sits beside it.
 */
export function ConnectionsScreen({ mindId }: { mindId: string }) {
  const mind = useMind(mindId).data
  const demo = Boolean(useSession().data?.demo)
  const [watching, setWatching] = useState<ApiConnection["toolkit"] | null>(null)
  const connections = useConnections({ watching })
  const secrets = useSecrets()
  const connect = useConnect()
  const cancel = useDisconnect()
  const [open, setOpen] = useState<Open>(null)
  const [opened, setOpened] = useState(0)
  const [fresh, setFresh] = useState<string | null>(null)
  const show = (o: Open) => {
    setOpened((n) => n + 1)
    setOpen(o)
  }
  // A try-out sees Add key too, and it says why keys need a wallet (T1.4).
  const locked = useTryOutLock()

  const name = mind?.name ?? "Your Mind"
  const expired = APPS.filter((a) => connectionStatus(connections.data, a.toolkit) === "expired")

  function startConnect(toolkit: ApiConnection["toolkit"]) {
    connect.mutate(toolkit, { onSuccess: () => setWatching(toolkit) })
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 xl:p-8">
      <PageTitle title="Connections" description={`Apps and keys ${name} can use. You can disconnect or delete any of them at any time.`} />

      {expired.map((a) => (
        <div key={a.toolkit} role="status" className="flex items-center gap-3 rounded-md bg-warning-soft px-4 py-2.5 text-sm text-foreground">
          <TriangleAlertIcon className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1">
            {TOOLKIT_NAME[a.toolkit]} is disconnected, so {a.toolkit === "gmail" ? "Email helper" : "Daily planner's calendar"} is paused.
          </p>
          <button type="button" onClick={() => startConnect(a.toolkit)} className="shrink-0 rounded-sm font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus">
            Reconnect
          </button>
        </div>
      ))}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <section aria-labelledby="apps" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
            <h2 id="apps" className="text-[15px] font-semibold text-foreground">
              Apps
            </h2>
            {demo && <p className="text-[13px] text-muted-foreground">This try-out uses a sample inbox and calendar, so there is nothing to connect.</p>}
            {connections.isPending ? (
              <Skeleton className="h-36 w-full" />
            ) : connections.isError ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-[13px] text-muted-foreground">Couldn&apos;t check your apps. Try again in a moment.</p>
                <Button variant="outline" size="sm" onClick={() => void connections.refetch()}>
                  Try again
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {APPS.map((a) => {
                  const c = connections.data?.find((x) => x.toolkit === a.toolkit)
                  const status = c?.status ?? "not_connected"
                  const waiting = status === "pending" || (watching === a.toolkit && status !== "connected")
                  const app = TOOLKIT_NAME[a.toolkit]
                  return (
                    <li key={a.toolkit} className="flex flex-col gap-3 rounded-md bg-muted px-4 py-3 sm:flex-row sm:items-center">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface">{a.logo}</span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{app}</span>
                          {status === "connected" ? (
                            <Badge variant="success">
                              <CheckIcon />
                              Connected
                            </Badge>
                          ) : waiting ? (
                            <Badge variant="warning">
                              <Loader2Icon className="animate-spin motion-reduce:animate-none" />
                              Waiting for Google
                            </Badge>
                          ) : status === "expired" ? (
                            <Badge variant="destructive">Disconnected</Badge>
                          ) : (
                            <Badge variant="neutral">Not connected</Badge>
                          )}
                        </div>
                        <p className="text-[13px] text-muted-foreground">
                          {status === "connected"
                            ? `${c?.since ? `Since ${shortWhen(c.since)}. ` : ""}${a.uses}`
                            : waiting
                              ? "Finish signing in to Google in the other window. This page updates by itself."
                              : status === "expired"
                                ? `Google ended the connection. ${a.toolkit === "gmail" ? "Email helper can't read mail" : "Daily planner can't see your calendar"} until you reconnect.`
                                : a.needs}
                        </p>
                      </div>
                      {!demo &&
                        (status === "connected" ? (
                          <Button variant="outline" size="sm" className="w-fit" onClick={() => show({ kind: "disconnect", toolkit: a.toolkit })}>
                            Disconnect
                          </Button>
                        ) : waiting ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-fit"
                            disabled={cancel.isPending}
                            onClick={() => {
                              setWatching(null)
                              cancel.mutate(a.toolkit)
                            }}
                          >
                            Cancel
                          </Button>
                        ) : (
                          <Button size="sm" className="w-fit" disabled={connect.isPending} onClick={() => startConnect(a.toolkit)}>
                            <ExternalLinkIcon />
                            {status === "expired" ? "Reconnect" : `Connect ${app}`}
                          </Button>
                        ))}
                    </li>
                  )
                })}
              </ul>
            )}
            {connect.error && <p className="text-[13px] text-danger">Couldn&apos;t open Google. Nothing changed; try again in a moment.</p>}
            <p className="text-xs text-muted-foreground">More apps come later. For anything else, add a key below.</p>
          </section>

          <section aria-labelledby="keys" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 id="keys" className="text-[15px] font-semibold text-foreground">
                  Keys
                </h2>
                <p className="text-[13px] text-muted-foreground">For your own services. Used by the Other apps skill.</p>
              </div>
              <Button size="sm" onClick={() => (demo ? locked.lock("keys") : show({ kind: "add" }))}>
                <PlusIcon />
                Add key
              </Button>
            </div>
            {secrets.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : secrets.isError ? (
              <p className="text-[13px] text-muted-foreground">Couldn&apos;t load your keys.</p>
            ) : !secrets.data?.length ? (
              <p className="py-2 text-[13px] text-muted-foreground">
                {demo ? "A try-out can't keep keys." : `No keys yet. Add one when you want ${name} to call a service of your own.`}
              </p>
            ) : (
              <ul className="flex flex-col">
                {secrets.data.map((s) => (
                  <li key={s.name} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <KeyRoundIcon className="size-4 text-muted-foreground" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{s.name}</span>
                        {fresh === s.name && <Badge variant="info">New</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Only sent to {s.allowedHosts.join(", ")}. {fresh === s.name ? "Added just now" : `Updated ${shortWhen(s.updatedAt)}`}
                      </span>
                    </div>
                    <span aria-label="Hidden" className="rounded-sm bg-muted px-2.5 py-1 text-[13px] tracking-widest text-muted-foreground">
                      ••••••••
                    </span>
                    {!demo && (
                      <span className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={`Replace ${s.name}`} onClick={() => show({ kind: "replace", secret: s })}>
                          <PencilIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${s.name}`} className={cn("hover:text-danger")} onClick={() => show({ kind: "delete", secret: s })}>
                          <Trash2Icon />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 xl:sticky xl:top-8 xl:w-[380px] xl:shrink-0">
          <h2 className="text-[15px] font-semibold text-foreground">How your keys are kept</h2>
          {/* Each line is [tested] in docs/api-contract.md: §7 (no values back), §2 (#18, https only,
              listed hosts only, the model only sees placeholders) and §7 (Autopilot gets no secrets). */}
          <ul className="flex flex-col gap-2.5">
            {[
              "Never shown again after you save, not even to you",
              "Only sent to the sites you list, over a secure connection",
              `${name} never sees the key itself, so it can't repeat it in chat`,
              "Scheduled jobs in Autopilot can't use keys yet",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2 text-[13px] text-foreground">
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
                {t}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <TryOutLockedDialog action={locked.action} name={name} onClose={locked.close} />
      {open?.kind === "add" || open?.kind === "replace" ? (
        <KeyDialog
          key={opened}
          mindName={name}
          existing={open.kind === "replace" ? open.secret : null}
          taken={secrets.data?.map((s) => s.name) ?? []}
          open
          onOpenChange={(o) => !o && setOpen(null)}
          onSaved={setFresh}
        />
      ) : null}
      {open?.kind === "delete" && <DeleteKeyDialog key={opened} mindName={name} secret={open.secret} open onOpenChange={(o) => !o && setOpen(null)} />}
      {open?.kind === "disconnect" && <DisconnectDialog key={opened} mindName={name} toolkit={open.toolkit} open onOpenChange={(o) => !o && setOpen(null)} />}
    </div>
  )
}
