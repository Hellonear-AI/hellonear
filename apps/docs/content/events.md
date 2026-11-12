---
title: Streaming events
description: The server-sent events every chat, approval, workflow and attack run streams, in order.
---

The engine **normalizes** Mastra stream chunks into these events. The browser and the Mind Graph depend on this format, not on raw Mastra chunks, so a Mastra upgrade cannot break the UI.

Common fields on every event:

| Field | Type | Notes |
|---|---|---|
| `v` | `1` | contract version |
| `type` | string | see below |
| `runId` | string | Mastra `runId` |
| `mindId` | string | |
| `seq` | integer | 0, 1, 2… per run; the backend uses `(runId, seq)` as the primary key |
| `ts` | string | ISO 8601, set by the engine |

### Event types

| `type` | Extra fields | From Mastra chunk |
|---|---|---|
| `run.started` | `threadId`, `model`, `nodeId` (`model:{modelId}`), `skills` (ids actually loaded) | `start` |
| `step.started` | `step` (1-based) | `step-start` |
| `reasoning.delta` | `text` | `reasoning-delta` (glm only; DeepSeek sends none) |
| `text.delta` | `text` | `text-delta` Em and en dashes are replaced by a plain hyphen before the event is sent (house style, #109, #124); the TEE verification covers the model's own bytes |
| `tool.called` | `toolCallId`, `tool`, `nodeId`, `args`; `approvedBy: "rule"` and `rule: "tool" \| "payment"` when an owner's auto-approve rule (#167) lets the call run without a `tool.approval_required` | `tool-call`: payload `{ toolCallId, toolName, args }` |
| `tool.result` | `toolCallId`, `tool`, `nodeId`, `result`, `status: "ok"` | `tool-result`: payload `{ toolCallId, toolName, args, result }` |
| `tool.error` | `toolCallId`, `tool`, `nodeId`, `status: "error" \| "policy_denied" \| "wallet_frozen" \| "rejected" \| "rate_limited"`, `error`, `result?` | `tool-error`; for `send_payment`, a `tool-result` whose `status` is `policy_denied` / `wallet_frozen` (the wallet refused before signing, #42): `error` is OutLayer's message, `result` the payment receipt without `txHash`; for `mail_send`, a `tool-result` whose `status` is `rejected` / `rate_limited` (#96): `error` is the refusal's `message`, `result` the send record without `messageId` |
| `tool.approval_required` | `toolCallId`, `tool`, `nodeId`, `args` | `tool-call-approval` |
| `step.finished` | `step`, `usage` | `step-finish` |
| `run.finished` | `finishReason`, `text`, `usage`, `costUsd`, `verification: { status: "pending" }` | `finish` |
| `run.finished` (canceled) | `status: "canceled"`, `finishReason: "canceled"`; no `text`, `usage` or `costUsd`, and no `run.verified` after it | **backend**, not the engine: the last event of a run stopped with `POST /v1/runs/{runId}/cancel` (#121); a builder run gets `workflow.finished` with `status: "canceled"` instead |
| `attack.verdict` | `attackId`, `attacker`, `paymentTool` (the Mind's skills grant `send_payment`), `stoppedBy`: `model` (refused, asked for no payment) · `no_tool` (no payment tool) · `approval` (a payment card waits for the owner) · `policy` (approved, then refused by the wallet in OutLayer's TEE before signing: `policy_denied` / `wallet_frozen`, no tx) · `none` (a payment was sent), `detail`, optional `to`, `status`, `attackerTargeted` (the payment went to the scenario's attacker), `txHash` (only for `none`) | engine (`src/attacks.ts`, #16), on a run that carries `attackId`, after `run.finished` and before `run.verified` |
| `thread.titled` | `threadId`, `title` (3 to 6 words summing up the user's first message, in the user's language, no quotes or final period) | engine (`src/titles.ts`, #86, #93), after the `run.finished` of a thread's first run and before `run.verified`; skipped if making the title fails or takes too long, and then the backend keeps the first-message cut |
| `run.verified` | `model`, `nodeId`, `verification` (see below). Always the run's **last** event | engine, after the stream is read |
| `run.error` | `error` | `error` chunk or a thrown error. The backend adds one itself when the engine stream breaks (`engine_stream_interrupted`), and when a run stayed `running` after a backend restart (`run_interrupted`, #218) |
| `workflow.started` | `workflowId`, `nodeId` (`workflow:{workflowId}`), `model`, `skills` | `workflow-start`; first event of a builder run |
| `node.started` | `node` (canvas node id), `nodeType` (`agent \| tool \| http`), `nodeId` (Mind Graph) | `workflow-step-start` |
| `node.finished` | `node`, `nodeType`, `nodeId`, `status: "ok"` + `output`, or `status: "error"` + `error` | `workflow-step-result` |
| `workflow.finished` | `workflowId`, `status` (`success`, `failed`, …) | `workflow-finish`; followed by `run.verified` as the last event |

`usage` = `{ "inputTokens": 441, "outputTokens": 28, "reasoningTokens": 2, "totalTokens": 469 }`. It is only filled while streaming when the engine builds models with `@ai-sdk/openai-compatible` + `includeUsage: true`; with the `nearai/<id>` router string it is empty.

`costUsd` = `inputTokens × input price + outputTokens × output price`, prices from `GET https://cloud-api.near.ai/v1/model/list` (cached by the engine).

`verification` (on `run.verified`), computed with `@nearai/inference-sdk` (`verifyResponse` per completion, after Gateway and model attestation):
- `{ "status": "verified", "level": "model_tee" | "gateway_tee", "completionIds": [...] }`: every model step verified. `model_tee` only if every step was signed inside the model TEE (`provider_tee`); streaming completions are signed by the Gateway TEE, so a normal chat run is `gateway_tee` (measured 3 Nov).
  - `proof` (#254, optional: present when every step carried its evidence; absent on runs before it) = `{ checkedAt, steps: [{ id, signatureKind, signer: { algo, address }, signedText, signature, attestation }], attestations: { [attestation]: { kind: "gateway" | "model", signer: { algo, address }, nonce, intelQuote, tcbStatus, gpuEvidence?, composeHash?, osImageHash? } } }`. Taken from the SDK's own `verifyResponse` result, nothing fetched again, no API key. `signedText` is `{request_hash}:{response_hash}` (gateway) or `{model}:{request_hash}:{response_hash}`: hashes only. Each step's `attestation` keys the attestation whose signer signed it; anyone can check the `intelQuote` at https://proof.t16z.com. About 12 KB per run (a 10,012-character quote for one gateway attestation, measured 11 Nov), so the backend stores it but leaves it out of the stream (chat, approve/decline, Telegram), `GET /v1/runs/{runId}` and the Mind Graph's events, and serves it on its own at `GET /v1/runs/{runId}/proof` (#254).
- `{ "status": "not_applicable", "reason": "incognito_model" | "no_completions" }`: Incognito models (`verifiable: false` in the model list) never get the private badge.
- `{ "status": "failed", "completionIds": [...], "errors": [...] }`: show no badge.

UI wording: `model_tee` → "Verified private (model TEE)"; `gateway_tee` → "Verified via NEAR AI TEE gateway"; anything else → no badge.

Builder runs (#20) send `workflow.started → node.started/node.finished… → workflow.finished → run.verified`. Inside an `agent` node the chat events appear between its `node.started` and `node.finished` (`step.*`, `reasoning.delta`, `text.delta`, `tool.*`), but no `run.started` / `run.finished`. A run with no agent node ends with `run.verified` `{ status: "not_applicable", reason: "no_completions" }`. Condition nodes emit nothing; only the branch that ran appears.

Example sequence for one tool call:

```text
run.started → step.started{1} → reasoning.delta… → tool.called{addNumbers} → tool.result{addNumbers}
→ step.finished{1} → step.started{2} → text.delta… → step.finished{2} → run.finished
```

### Not forwarded to the browser

`tool-call-input-streaming-start`, `tool-call-delta`, `tool-call-input-streaming-end`, `text-start`, `text-end`, `reasoning-start`, `reasoning-end`, `raw`. The engine drops them; nothing in the UI needs partial tool arguments.

### Secrets in events

No event may contain a secret value. The engine redacts known secret **values** (not just field names) in every event field, including `run.error`, before emitting, replacing them with `"••••"`.
