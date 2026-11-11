"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowUpRightIcon, CheckIcon, CircleAlertIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "cn"
import { CopyButton } from "@/components/elements/CopyButton"
import { ResponsiveDialog } from "@/components/elements/ResponsiveDialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { isApiCode } from "@/lib/api"
import { chatKeys } from "@/lib/queryKeys"
import { chatApi } from "@/modules/chat/api"
import { checkedSteps, replyProof, shortHex, tcbText, TEE_EXPLORER_URL, type Proof } from "@/modules/runs/data/proof"

const VERIFIER_URL = "https://github.com/nearai/nearai-cloud-verifier"

/**
 * "View proof" (#254): the evidence behind a reply's verified badge, in plain words first. Each
 * step was signed by the attested key; the hardware's own report (Intel, and NVIDIA where the
 * model itself runs in the TEE); then the raw pieces to copy and the public checkers. Raw quotes
 * and signatures are never laid out on screen, only copied. Read when opened
 * (`GET /runs/{runId}/proof`, #257); the last entry is the reply's.
 */
export function ProofDialog({ runId, open, onOpenChange }: { runId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const proofs = useQuery({
    queryKey: chatKeys.proof(runId),
    queryFn: () => chatApi.runProof(runId),
    enabled: open,
    staleTime: Infinity,
    retry: (count, err) => !isApiCode(err, "no_proof") && !isApiCode(err, "run_not_found") && count < 2,
  })
  const entry = replyProof(proofs.data)

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="The proof behind this reply"
      description="What HelloNear checked before showing the badge. You can check the same evidence yourself."
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      }
    >
      <div className="flex max-h-[60dvh] flex-col gap-5 overflow-y-auto md:max-h-[65vh]">
        {proofs.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ) : proofs.error ? (
          <p className="text-[13px] text-muted-foreground">
            {isApiCode(proofs.error, "no_proof")
              ? "No proof was kept for this reply. Replies from before 11 Nov don't have one."
              : "Could not load the proof. Please try again later."}
          </p>
        ) : entry ? (
          <ProofBody proof={entry.proof} model={entry.model} />
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}

function ProofBody({ proof, model }: { proof: Proof; model: string | null }) {
  const steps = checkedSteps(proof)
  const attestations = Object.values(proof.attestations)
  const allMatch = steps.length > 0 && steps.every((s) => s.matches)
  const checkedAt = new Date(proof.checkedAt)
  const raw = JSON.stringify(proof, null, 2)

  return (
    <>
      <Section title="Signed inside the TEE">
        <Line ok={allMatch}>
          {allMatch
            ? `All ${steps.length} ${steps.length === 1 ? "step was" : "steps were"} signed by the key the hardware vouches for.`
            : "A step's signer doesn't match the attested key."}
        </Line>
        <ul className="flex flex-col gap-1.5">
          {steps.map(({ step, matches }) => (
            <li key={step.id} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-muted-foreground">
                {step.signatureKind === "provider_tee" ? "Model step" : "Gateway step"}, signed by{" "}
                <span className="font-mono text-foreground">{shortHex(step.signer.address)}</span>
              </span>
              {matches ? <CheckIcon aria-label="Matches" className="size-4 shrink-0 text-success" /> : <CircleAlertIcon aria-label="Doesn't match" className="size-4 shrink-0 text-danger" />}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Only hashes of the messages were signed, never the conversation.{model ? ` Model: ${model.split("/").pop()}.` : ""}
        </p>
      </Section>

      <Section title="Hardware checked">
        {attestations.map((a) => {
          const tcb = tcbText(a.tcbStatus)
          return (
            <div key={`${a.kind}:${a.signer.address}`} className="flex flex-col gap-1.5">
              <p className="text-[13px] font-medium text-foreground">{a.kind === "model" ? "The model's TEE" : "NEAR AI's gateway TEE"}</p>
              <Line ok={tcb.ok}>Intel TDX report: {tcb.text.toLowerCase()}</Line>
              {a.gpuEvidence && <Line ok>NVIDIA GPU evidence included</Line>}
              <p className="text-xs text-muted-foreground">
                Fresh for this check (nonce {shortHex(a.nonce)})
              </p>
            </div>
          )
        })}
        {!Number.isNaN(checkedAt.getTime()) && (
          <p className="text-xs text-muted-foreground">
            Checked {checkedAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </Section>

      <Section title="Check it yourself">
        <div className="flex flex-col gap-2">
          {attestations[0] && (
            <Row label="Intel quote">
              <CopyButton text={() => attestations[0].intelQuote} label="Copy the Intel quote" showLabel />
            </Row>
          )}
          <Row label="The whole proof">
            <CopyButton text={() => raw} label="Copy the proof" showLabel />
          </Row>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-medium">
          <a href={TEE_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-foreground hover:underline">
            Paste the quote in TEE Explorer
            <ArrowUpRightIcon className="size-3.5" />
          </a>
          <a href={VERIFIER_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-foreground hover:underline">
            NEAR AI&apos;s verifier
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        </div>
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

function Line({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p className={cn("flex items-start gap-2 text-[13px]", ok ? "text-foreground" : "text-danger")}>
      {ok ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />}
      {children}
    </p>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
