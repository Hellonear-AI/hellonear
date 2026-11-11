"use client"

import { ArrowUpRightIcon } from "lucide-react"
import { CopyButton } from "@/components/elements/CopyButton"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const DOCS_URL = "https://docs.near.ai/cloud/verification"
const VERIFIER_URL = "https://github.com/nearai/nearai-cloud-verifier"

/** "zai-org/GLM-4.6" -> "GLM-4.6". */
const modelName = (id: string) => id.split("/").pop() ?? id

/**
 * The verified badge under a reply (#19). It opens a short explanation (Ancung, 11 Nov: like
 * near.ai/models' "Private TEE" note, with a way to the proof): what was checked, for which model,
 * how many steps, their ids to copy, and the public docs and verifier. It only says what the
 * engine proved (`run.verified`, docs/api-contract.md §3); the signatures and attestation reports
 * themselves need a NEAR AI key the browser doesn't have, so they aren't shown here.
 */
export function VerifiedBadge({ level, proof }: { level: "gateway_tee" | "model_tee"; proof?: { model: string | null; completionIds: string[] } }) {
  const label = level === "model_tee" ? "Verified private (model TEE)" : "Verified via NEAR AI TEE gateway"
  const steps = proof?.completionIds ?? []
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${label}. What this means`}
            className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-focus aria-expanded:opacity-80"
          />
        }
      >
        <Badge variant="verified" className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
          {label}
        </Badge>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-[13px] text-muted-foreground">
            {level === "model_tee"
              ? "This reply was made inside a sealed part of the chip (a TEE) that runs the model itself, so not even NEAR AI can read your messages."
              : "This reply came through NEAR AI's gateway, which runs inside a sealed part of the chip (a TEE)."}{" "}
            Every step was signed by a key that never leaves it, and HelloNear checked each signature against the hardware&apos;s own proof from NVIDIA and Intel.
          </p>
        </div>
        <dl className="flex flex-col gap-1.5 text-[13px]">
          {proof?.model && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Model</dt>
              <dd className="truncate font-medium text-foreground">{modelName(proof.model)}</dd>
            </div>
          )}
          {steps.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Steps checked</dt>
              <dd className="flex items-center gap-1 font-medium text-foreground">
                {steps.length}
                <CopyButton text={() => steps.join("\n")} label="Copy step ids" />
              </dd>
            </div>
          )}
        </dl>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-medium">
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-foreground hover:underline">
            How it&apos;s verified
            <ArrowUpRightIcon className="size-3.5" />
          </a>
          <a href={VERIFIER_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-foreground hover:underline">
            Check it yourself
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        </div>
      </PopoverContent>
    </Popover>
  )
}
