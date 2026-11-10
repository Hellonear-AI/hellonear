"use client"

import { useBuilder } from "@/modules/builder/components/BuilderContext"
import { BlockCard } from "@/modules/builder/components/canvas/BlockCard"
import { PromptPreview } from "@/modules/builder/components/PromptText"
import { KIND_META } from "@/modules/builder/data/blocks"
import { promptParts, type Result, type Step } from "@/modules/builder/data/draft"
import { toolInfo } from "@/modules/builder/data/tools"
import { shortAddress } from "@/modules/wallet/data/address"

/** A step's card: an Ask's prompt, a website's host, or a tool with what it looks at. */
export function StepCard({
  step,
  results = [],
  active,
  problem,
  onClick,
}: {
  step: Step
  /** Earlier results, so a prompt shows {Balance} instead of its reference. */
  results?: Result[]
  active: boolean
  problem: boolean
  onClick: () => void
}) {
  const { name } = useBuilder()
  const { tone, Icon, title } = KIND_META[step.kind]
  if (step.kind === "agent") {
    return (
      <BlockCard
        tone={tone}
        icon={<Icon />}
        kind={title(name)}
        nodeId={step.id}
        title={step.prompt.trim() ? <PromptPreview parts={promptParts(step.prompt.trim(), results)} className="line-clamp-2" /> : "Say what to do"}
        line={step.prompt.trim() ? undefined : "Not set yet"}
        active={active}
        warn={problem}
        onClick={onClick}
      />
    )
  }
  if (step.kind === "http") {
    let host = "Not set yet"
    try {
      host = new URL(step.url).hostname || host
    } catch {
      // keep "Not set yet"
    }
    return (
      <BlockCard
        tone={tone}
        icon={<Icon />}
        kind={title(name)}
        nodeId={step.id}
        title={`${step.method === "GET" ? "Read from" : "Send to"} ${host}`}
        line={step.key ? `With your key ${step.key}` : undefined}
        active={active}
        warn={problem}
        onClick={onClick}
      />
    )
  }
  const info = toolInfo(step.tool)
  const account = step.args.accountId
  const own = step.tool === "googlecalendar_block_time" ? `${step.args.title?.trim() || "An event"} at ${step.args.at || "09:00"}` : step.tool === "mail_send_to_owner" ? step.args.subject?.trim() || "No subject yet" : null
  return (
    <BlockCard
      tone={tone}
      icon={<Icon />}
      kind={title(name)}
      nodeId={step.id}
      title={info?.title ?? "A tool"}
      line={account ? shortAddress(account) : own ?? info?.line}
      mono={Boolean(account)}
      active={active}
      warn={problem}
      onClick={onClick}
    />
  )
}
