"use client"

import { CheckIcon, CircleSlashIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { cn } from "cn"
import { MindAvatar } from "@/components/elements/MindAvatar"
import { ResponsiveDialog } from "@/components/elements/ResponsiveDialog"
import { Button } from "@/components/ui/button"
import { useMind } from "@/modules/minds/hooks/useMinds"
import { setFlag, useFlag } from "@/modules/onboarding/data/progress"

/**
 * Welcome (Ancung, 11 Nov): a short introduction the first time someone opens the app, four
 * slides with small illustrations. The illustrations are built from the app's own pieces (the
 * Mind's art, an approval card, the daily meter, the live view), so they follow the theme and say
 * what the app really shows. Seen once per device; Getting started can play it again.
 */
export function Welcome({ mindId }: { mindId: string }) {
  const seen = useFlag("welcome")
  const mind = useMind(mindId).data
  const [at, setAt] = useState(0)
  if (seen || !mind) return null

  const name = mind.name
  const slides: { title: string; text: string; art: ReactNode }[] = [
    {
      title: `Meet ${name}`,
      text: `${name} is your Mind. It chats with you, remembers what matters, and uses the skills you add: email, calendar, payments and more.`,
      art: <MeetArt name={name} templateId={mind.templateId} />,
    },
    {
      title: "It asks before it pays",
      // Not "every payment": an auto-approve rule (#167) can let small ones through.
      text: "Payments wait for your Approve, here in the chat or in Telegram, and you see who gets paid and how much first. Small ones can skip it if you set a rule in its settings.",
      art: <ApproveArt />,
    },
    {
      title: "Your limits are out of its reach",
      text: `How much per payment, per day and who it may pay are kept by the wallet itself. ${name} can't change them, even if someone tricks it.`,
      art: <LimitsArt />,
    },
    {
      title: "Watch it work",
      text: `The live view shows every skill and app ${name} uses while it answers. Getting started, in the sidebar, takes you through the rest.`,
      art: <GraphArt templateId={mind.templateId} />,
    },
  ]
  const slide = slides[at]
  const last = at === slides.length - 1
  const close = () => setFlag("welcome")

  return (
    <ResponsiveDialog
      centered
      open
      onOpenChange={(open) => !open && close()}
      // Bigger on phones, where the drawer has the whole width (Ancung, 11 Nov: it read too small).
      title={<span className="block text-xl md:text-lg">{slide.title}</span>}
      description={<span className="block text-[15px] leading-6 md:text-sm md:leading-5">{slide.text}</span>}
      top={
        <div key={at} className="flex h-60 items-center justify-center overflow-hidden rounded-lg bg-muted md:h-44 animate-in fade-in-0 zoom-in-95 duration-300 ease-out motion-reduce:animate-none">
          <div className="scale-125 md:scale-100">{slide.art}</div>
        </div>
      }
      footer={
        <div className="flex w-full flex-col gap-8 md:flex-row md:items-center md:justify-between md:gap-3">
          <div className="flex items-center justify-center gap-1.5 md:justify-start" role="tablist" aria-label="Slides">
            {slides.map((s, i) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={i === at}
                aria-label={`Slide ${i + 1} of ${slides.length}`}
                onClick={() => setAt(i)}
                className={cn("h-1.5 rounded-full transition-all duration-200 ease-out", i === at ? "w-5 bg-foreground" : "w-1.5 bg-border-strong hover:bg-muted-foreground")}
              />
            ))}
          </div>
          {/* Phones: the main button on top, full width; desktop: side by side. */}
          <div className="flex flex-col-reverse gap-4 md:flex-row md:gap-2 [&>*]:w-full md:[&>*]:w-auto">
            {at > 0 ? (
              <Button variant="ghost" onClick={() => setAt(at - 1)}>
                Back
              </Button>
            ) : (
              <Button variant="ghost" className="text-muted-foreground" onClick={close}>
                Skip
              </Button>
            )}
            <Button onClick={() => (last ? close() : setAt(at + 1))}>{last ? "Get started" : "Next"}</Button>
          </div>
        </div>
      }
    />
  )
}

/** The Mind says hi, the owner asks something. */
function MeetArt({ name, templateId }: { name: string; templateId: string }) {
  return (
    <div aria-hidden className="flex w-64 flex-col gap-2">
      <div className="flex items-end gap-2">
        <MindAvatar templateId={templateId} size={40} />
        <span className="rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-[13px] text-foreground shadow-xs">Hi, I&apos;m {name}. What can I do?</span>
      </div>
      <span className="self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[13px] text-primary-foreground">What&apos;s my balance?</span>
    </div>
  )
}

/** A small approval card, as the chat shows it. */
function ApproveArt() {
  return (
    <div aria-hidden className="flex w-64 flex-col gap-2 rounded-lg bg-warning-soft p-3 shadow-xs">
      <span className="text-[13px] font-semibold text-foreground">0.5 NEAR to shop.testnet</span>
      <span className="flex items-center gap-1.5 text-xs text-foreground">
        <CheckIcon className="size-3 text-success" />
        Within your 2 NEAR limit
      </span>
      <span className="flex items-center gap-1.5 text-xs text-foreground">
        <CheckIcon className="size-3 text-success" />
        On your list of addresses
      </span>
      <span className="mt-1 flex gap-1.5">
        <span className="rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-medium text-foreground">Decline</span>
        <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Approve</span>
      </span>
    </div>
  )
}

/** Today's spend against the daily limit, and a payment the wallet stopped. */
function LimitsArt() {
  return (
    <div aria-hidden className="flex w-64 flex-col gap-2.5">
      <div className="flex flex-col gap-1.5 rounded-lg bg-surface p-3 shadow-xs">
        <span className="flex justify-between text-xs">
          <span className="font-semibold text-foreground">1.50 of 5 NEAR today</span>
          <span className="text-muted-foreground">3.50 left</span>
        </span>
        <span className="h-1.5 overflow-hidden rounded-full bg-border">
          <span className="block h-full w-[30%] rounded-full bg-foreground" />
        </span>
      </div>
      <span className="flex items-center gap-1.5 self-start rounded-full bg-danger-soft px-3 py-1.5 text-xs font-medium text-foreground">
        <CircleSlashIcon className="size-3.5 text-danger" />
        Blocked: over your 2 NEAR limit
      </span>
    </div>
  )
}

/** A tiny live view: the Mind in the middle, a skill and an app lit as it works. */
function GraphArt({ templateId }: { templateId: string }) {
  const nodes = [
    { x: 60, y: 40, r: 9, c: "var(--node-skill)" },
    { x: 200, y: 36, r: 7, c: "var(--node-app)" },
    { x: 222, y: 110, r: 8, c: "var(--node-wallet)" },
    { x: 48, y: 120, r: 7, c: "var(--node-memory)" },
    { x: 150, y: 136, r: 6, c: "var(--node-tool)" },
  ]
  return (
    <div aria-hidden className="relative h-40 w-64">
      <svg viewBox="0 0 256 160" className="absolute inset-0 size-full">
        {nodes.map((n, i) => (
          <line key={i} x1="128" y1="80" x2={n.x} y2={n.y} stroke={i === 0 || i === 1 ? "var(--brand)" : "var(--border-strong)"} strokeWidth={i < 2 ? 2 : 1} />
        ))}
        <line x1="60" y1="40" x2="200" y2="36" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="2 3" />
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.c} />
        ))}
        <circle r="3" fill="var(--brand)" className="motion-reduce:hidden">
          <animateMotion dur="1.6s" repeatCount="indefinite" path="M128 80 L60 40" />
        </circle>
      </svg>
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-brand/40">
        <MindAvatar templateId={templateId} size={40} />
      </span>
    </div>
  )
}
