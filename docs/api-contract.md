# API contract: backend ↔ engine ↔ frontend

> Status: **draft v1** for review by James (#7). Source of truth once merged. Change it in the same PR as the code that changes behaviour, and update the `CLAUDE.md` of every consumer.

Evidence tags:
- **[tested]** observed in spike #5 (`engine/spikes/01-tool-calling/results.json`, `@mastra/core` 1.81.0, 2 Nov 2026).
- **[tested, #11]** covered by the engine integration tests (`engine/test/engine.test.ts`).
- **[docs]** taken from the docs bundled in `@mastra/core` 1.81.0 (`dist/docs/references/`), not exercised yet.

## 1. Who talks to whom

```
Browser (apps/fe) ──HTTPS + session cookie──► Backend (apps/be) ──HTTP + SSE, X-Engine-Key──► Engine (engine/)
       ▲                                          │
       └────────────── SSE (HelloNear events) ◄────┘   (backend stores every event in run_events)
```

- The browser **only** talks to the backend. It never sees the engine, OutLayer keys, Composio tokens, or secrets.
- The backend authenticates the user (NEP-413 login, #8), checks the user owns the Mind, then calls the engine.
- The engine trusts the backend through a shared secret header `X-Engine-Key` (env `ENGINE_API_KEY` on both sides). The engine is not exposed to the internet.

## 2. Engine HTTP API (called by the backend)

All bodies are JSON (at most 256 KB, else `413 { error: "body_too_large" }`; unparseable JSON → `400 { error: "invalid_json" }`). All ids are strings.

### `POST /v1/minds/{mindId}/chat`

Starts a run and streams HelloNear events as SSE (`text/event-stream`, one JSON event per `data:` line).

```json
{
  "userId": "usr_123",
  "threadId": "thr_456",
  "message": "What is 17 + 25?",
  "mind": {
    "templateId": "payments-mind",
    "name": "Penny",
    "soul": { "identity": "…", "invariants": ["…"], "priors": ["…"] },
    "model": "z-ai/glm-5.3-flash",
    "skills": [{ "skillId": "payments" }, { "skillId": "daily-planner" }]
  },
  "secrets": [{ "name": "SHOP_API_KEY", "value": "…", "allowedHosts": ["api.shop.com"] }]
}
```

- The backend sends the Mind config it loaded from its DB; the engine builds the agent from it per request through `RequestContext` (`research.md` 8.2).
- **`secrets`** (optional, #18): the owner's secrets for this run, decrypted by the backend from its store. Names are `UPPER_SNAKE_CASE`, each with at least one allowed host. The engine puts them in the run's `RequestContext` only; the model writes `{{secrets.NAME}}` placeholders that the `http_request` tool fills at execution. A secret only goes to its `allowedHosts`, only over public `https`, never through a redirect. Values are redacted from tool results (before the model reads them), from every event, and are not stored in the `mastra` schema **[tested, #18]**. Invalid secrets → `400`. Send the same `secrets` again on approve/decline.
- **Skills are sent by id only.** The engine's catalog (`engine/skills/<id>/SKILL.md`) decides which tools and playbook each skill grants, so the backend cannot grant arbitrary tools. An unknown `skillId` → `400`. A skill with status `blocked` is accepted but not loaded **[tested, #13]**.
- **`demo: true`** (only for judge try-out users, #43; absent otherwise): the run is from a visitor without a wallet login. The engine's email tools (`gmail_list_emails`, `gmail_read_email`, `gmail_create_draft`) then read a fixed, fictional sample inbox and never call Composio; results carry `source: "sample_inbox"`. Without `demo` they read the run user's own Gmail through Composio (the Composio user id is `userId`), or answer "Gmail is not connected" when that user has no Gmail connection **[tested: live "no connection" answer; a connected Gmail not tested yet]**. Also sent on approve/decline and builder runs **[tested, engine]**.
- Response: SSE stream of events (§3). The first event is `run.started` and carries `runId`.

### Payment tools: `walletToken` and the backend's internal wallet routes (#42, option B)

When the Mind has a wallet, the backend adds **`walletToken`** (`wt_…`) to the chat, approve/decline and builder-run bodies. It names that Mind and user and expires after 15 minutes; a new one comes with every call. Autopilot bodies never carry one, so payment tools stay out of Autopilot. The engine never gets the wallet key. Payment tools call the backend (`BACKEND_URL` in the engine's env) with **both** headers `X-Engine-Key: <ENGINE_API_KEY>` and `X-Wallet-Token: <walletToken>`:

| Route | Body | Answer |
|---|---|---|
| `POST /internal/v1/wallet/send_payment` | `{ to: "shop.testnet", amountNear: "0.01" }` (decimal string) | `{ paymentId, status, to, amountNear, txHash?, message? }`, `status` = `sent` (with `txHash`) \| `policy_denied` \| `wallet_frozen` \| `failed` \| `pending`. Refusals have **no** `txHash` (OutLayer refuses before signing) and carry OutLayer's message **[tested; live on testnet, 5 Nov]** |
| `GET /internal/v1/wallet/balance` | | `{ address, balanceNear }` **[tested]** |
| `GET /internal/v1/wallet/payments?limit=20` | | `{ payments: [{ paymentId, to, amountNear, status, txHash?, message?, at }] }`, newest first **[tested]** |

Loopback only: from any other address these routes answer `404 not_found`, so they are not reachable through the tunnel **[tested]**. `401 unauthorized` (engine key), `401 invalid_wallet_token` / `wallet_token_expired`, `404` (Mind deleted), `400 invalid_body`. Every attempt is stored as a receipt, refusals included.

Tools for the engine (replacing `demo_transfer`):

| Tool | Input | Output | Notes |
|---|---|---|---|
| `send_payment` | `{ to, amountNear }` | the `send_payment` answer | `requireApproval: true`. Show `policy_denied` / `wallet_frozen` as a hard stop (red in the Mind Graph), never as "rejected on-chain", never with a tx link |
| `get_balance` | `{}` | `{ address, balanceNear }` | |
| `list_payments` | `{ limit? }` | `{ payments }` | |

No `walletToken` in the body (Mind without a wallet): the tools should answer "this Mind has no wallet yet" without calling the backend.

### `POST /v1/runs/{runId}/approve?mindId={mindId}` and `POST /v1/runs/{runId}/decline?mindId={mindId}`

```json
{
  "userId": "usr_123",
  "threadId": "thr_456",
  "mind": { "…": "same Mind config as the chat request" },
  "toolCallId": "call_…",
  "reason": "optional, decline only"
}
```

Resumes a run paused on `tool.approval_required`. Streams the remaining events as SSE, same format, with `seq` continuing from the paused run. Maps to Mastra `approveToolCall()` / `declineToolCall()` with the run's `runId` **[tested, #11]**. The Mind config must be sent again because the agent's tools are resolved from it per request. Mastra needs storage for this (snapshots), so the engine always runs with Postgres storage.

### `GET /v1/templates`

`{ "templates": [ { templateId, name, tagline, soul, model, skills: [ { skillId, description, status: "available" | "simulated" | "blocked", connections: [...], note? } ] } ] }` for the Choose a Mind screen. Status tells the UI what is simulated or blocked (e.g. email before Composio) **[tested, #13]**.

### `GET /v1/skills`

`{ "skills": [ { skillId, description, status, connections: [...], note?, tools: [toolKey] } ] }`: **every** skill a Mind may equip, in id order, not only those a template starts with (e.g. `near-account` and `http-request`, which the Visual Builder's tools need). This is the list to validate a Mind's `skills` against; `blocked` skills are listed so the UI can say why they are off, and the engine never loads them. `tools` are the tool keys the skill grants (the Builder palette) **[tested]**.

### `GET /v1/health`

`{ "ok": true, "mastra": "1.81.0", "attestation": { "<modelId>": { "ok": true, "checkedAt": "…", "ms": 17558 } } }`: attestation is warmed at startup and every 50 minutes.

### Visual Builder workflows (#20)

A workflow belongs to one Mind. The canvas is saved by the engine (Mastra stores it in Postgres, schema `mastra`), so the backend only proxies these calls; ids: `workflowId` is lowercase words joined by single dashes (max 48), `mindId` letters/digits/`_` joined by single dashes.

| Method and path | Body | Response |
|---|---|---|
| `PUT /v1/minds/{mindId}/workflows/{workflowId}` | canvas (below) | `200 { workflowId, tools, steps, schedule, autopilot }` (`autopilot`: see below, `null` if off), or `400 { error: "invalid_workflow", issues: [{ path, message }] }`. Saving again replaces it; runs already started keep the old graph **[tested]** |
| `GET /v1/minds/{mindId}/workflows` | | `{ workflows: [{ workflowId, name, tools, schedule, updatedAt }] }` |
| `GET /v1/minds/{mindId}/workflows/{workflowId}` | | `{ workflowId, name, tools, schedule, updatedAt, canvas, steps }` (the canvas as saved, positions included) or `404` |
| `DELETE /v1/minds/{mindId}/workflows/{workflowId}` | | `204` or `404`. Also deletes its Autopilot schedule **[tested]** |
| `POST /v1/minds/{mindId}/workflows/{workflowId}/runs` | `{ userId, mind, secrets?, input? }` | SSE events (§3). `409 { error: "missing_tools", tools }` if the Mind no longer has a skill granting a tool the workflow uses. "Run again" = the same call again (new `runId`) **[tested]** |

Canvas (React Flow shape; `position` and extra fields are kept for the editor):

```json
{
  "name": "Low balance alert",
  "nodes": [
    { "id": "start", "type": "trigger", "position": { "x": 0, "y": 0 }, "data": { "schedule": { "cron": "0 * * * *" }, "inputs": [{ "name": "account", "type": "string" }] } },
    { "id": "balance", "type": "tool", "data": { "tool": "near_view_account", "args": { "accountId": "{{input.account}}" } } },
    { "id": "low", "type": "condition", "data": { "left": "{{steps.balance.balanceNear}}", "op": "lt", "right": 1000 } },
    { "id": "notify", "type": "http", "data": { "method": "POST", "url": "https://hooks.example.com/x", "headers": { "Authorization": "{{secrets.HOOK_TOKEN}}" }, "body": "{{steps.balance.accountId}} has {{steps.balance.balanceNear}} NEAR" } },
    { "id": "chill", "type": "agent", "data": { "prompt": "Say in five words that {{steps.balance.accountId}} is fine." } }
  ],
  "edges": [
    { "source": "start", "target": "balance" },
    { "source": "balance", "target": "low" },
    { "source": "low", "target": "notify", "sourceHandle": "then" },
    { "source": "low", "target": "chill", "sourceHandle": "else" }
  ]
}
```

Rules (the engine answers `400` with `issues` otherwise) **[tested]**:
- Node types: `trigger` (exactly one; optional `inputs` and `schedule`), `agent` (the Mind itself, `{ prompt }`), `tool` (`{ tool, args }`, `tool` = a tool key such as `near_view_account`, `add_numbers`, `get_time`), `http` (the `http_request` tool), `condition` (`left` is one reference, `op` is `eq | ne | lt | lte | gt | gte`, `right` a literal). At most 20 nodes.
- Shape: trigger → a chain of agent/tool/http nodes → optionally one condition whose `then` edge (required) and `else` edge each lead to one last node. No cycles, no unreachable nodes. Both branches may not need the same input with different values (e.g. two agent branches).
- References: `{{steps.<nodeId>.<field>}}` (a node that runs earlier), `{{input.<name>}}` (a trigger input), `{{secrets.NAME}}` (filled by the tool at execution, as in chat). A field that is only one reference keeps its type (numbers stay numbers). `${` is refused. Headers may hold secrets but not step references. Fields must exist in the tool's output schema (checked by Mastra).
- Tools needing approval (wallet actions) are refused: a workflow runs unattended and Mastra would execute them without asking. Agent steps in a workflow also never get approval tools.
- `schedule` (`{ cron, timezone? }`, 5-field cron, IANA timezone, default `UTC`) only runs once Autopilot is turned on for the workflow (below).

### Autopilot (#21)

A workflow whose trigger has a `schedule` can run on that cron with nobody watching (Mastra workflow schedules, `engine/spikes/03-autopilot`). Scheduled runs are **unattended**: agent steps get no approval tools, and no secrets are available.

| Method and path | Body | Response |
|---|---|---|
| `PUT /v1/minds/{mindId}/workflows/{workflowId}/autopilot` | `{ userId, mind, input?, enabled? = true }` | `200 { autopilot }`, or `409 { error: "cannot_autopilot", issues: [{ code, message, tools? }], autopilot }` **[tested]** |
| `GET /v1/minds/{mindId}/workflows/{workflowId}/autopilot` | | `{ autopilot }` (`null` if never turned on) **[tested]** |
| `DELETE /v1/minds/{mindId}/workflows/{workflowId}/autopilot` | | `204`, or `404` if it was not on **[tested]** |
| `GET /v1/minds/{mindId}/workflows/{workflowId}/runs?limit=20` | | `{ runs: [{ runId, trigger: "autopilot" \| "manual", status, startedAt, updatedAt, nodes: [{ node, nodeType, nodeId, status: "ok" \| "error" \| …, output?, error?, startedAt, endedAt }] }] }`, newest first, `limit` 1–100. Covers Autopilot and manual runs **[tested]** |

`autopilot` = `{ status: "active" | "paused", cron, timezone, nextFireAt, lastFireAt, lastRunId, pausedFor: [issue] }` (times are ISO strings or `null`).

- **The backend owns the Mind config.** `PUT …/autopilot` stores a copy of `mind` and `input`; send it again whenever the Mind changes (persona, model, skills). If the new config cannot run the workflow, the engine pauses the schedule and returns `409` with the reasons.
- Issue codes: `no_schedule`, `uses_secrets` (the canvas contains `{{secrets.…}}`: the schedule is stored as plain JSON, so secrets cannot go there yet), `missing_tools`, `invalid_input` (trigger inputs missing or wrong type), `invalid_schedule` (cron/timezone rejected).
- Saving the canvas again updates the cron of an existing schedule, or pauses it with `pausedFor` if the new canvas cannot run unattended. `enabled: false` pauses; `PUT` again with `enabled: true` resumes.
- Delivery is best-effort (Mastra docs, checked 4 Nov 2026): a fire can be skipped and is not replayed. The history shows what really ran (from run snapshots).
- Scheduled runs send no SSE events; show them from `GET …/runs` (poll while a run is `running`). Node ids match the Mind Graph (§4). There is no private badge for scheduled runs: the engine verifies completions only while it reads a live stream.
- Runs and fire history older than `RUN_RETENTION_DAYS` (engine env, default 14) are pruned hourly.

## 3. HelloNear events (engine → backend → browser)

The engine **normalizes** Mastra stream chunks into these events. The browser and the Mind Graph depend on this format, not on raw Mastra chunks, so a Mastra upgrade cannot break the UI.

Common fields on every event:

| Field | Type | Notes |
|---|---|---|
| `v` | `1` | contract version |
| `type` | string | see below |
| `runId` | string | Mastra `runId` **[tested]** |
| `mindId` | string | |
| `seq` | integer | 0, 1, 2… per run; the backend uses `(runId, seq)` as the primary key |
| `ts` | string | ISO 8601, set by the engine |

### Event types

| `type` | Extra fields | From Mastra chunk |
|---|---|---|
| `run.started` | `threadId`, `model`, `nodeId` (`model:{modelId}`), `skills` (ids actually loaded) | `start` **[tested]** |
| `step.started` | `step` (1-based) | `step-start` **[tested]** |
| `reasoning.delta` | `text` | `reasoning-delta` **[tested]** (glm only; DeepSeek sends none) |
| `text.delta` | `text` | `text-delta` **[tested]** |
| `tool.called` | `toolCallId`, `tool`, `nodeId`, `args` | `tool-call` **[tested]**: payload `{ toolCallId, toolName, args }` |
| `tool.result` | `toolCallId`, `tool`, `nodeId`, `result`, `status: "ok"` | `tool-result` **[tested]**: payload `{ toolCallId, toolName, args, result }` |
| `tool.error` | `toolCallId`, `tool`, `nodeId`, `status: "error" \| "policy_denied" \| "wallet_frozen"`, `error`, `result?` | `tool-error` **[tested]**; for `send_payment`, a `tool-result` whose `status` is `policy_denied` / `wallet_frozen` (the wallet refused before signing, #42): `error` is OutLayer's message, `result` the payment receipt without `txHash` **[tested, fake backend]** |
| `tool.approval_required` | `toolCallId`, `tool`, `nodeId`, `args` | `tool-call-approval` **[tested, #11]** |
| `step.finished` | `step`, `usage` | `step-finish` **[tested]** |
| `run.finished` | `finishReason`, `text`, `usage`, `costUsd`, `verification: { status: "pending" }` | `finish` **[tested]** |
| `run.verified` | `model`, `nodeId`, `verification` (see below). Always the run's **last** event | engine, after the stream is read **[tested, #19]** |
| `run.error` | `error` | `error` chunk or a thrown error |
| `workflow.started` | `workflowId`, `nodeId` (`workflow:{workflowId}`), `model`, `skills` | `workflow-start`; first event of a builder run **[tested, #20]** |
| `node.started` | `node` (canvas node id), `nodeType` (`agent \| tool \| http`), `nodeId` (Mind Graph) | `workflow-step-start` **[tested, #20]** |
| `node.finished` | `node`, `nodeType`, `nodeId`, `status: "ok"` + `output`, or `status: "error"` + `error` | `workflow-step-result` **[tested, #20]** |
| `workflow.finished` | `workflowId`, `status` (`success`, `failed`, …) | `workflow-finish`; followed by `run.verified` as the last event **[tested, #20]** |

`usage` = `{ "inputTokens": 441, "outputTokens": 28, "reasoningTokens": 2, "totalTokens": 469 }`. It is only filled while streaming when the engine builds models with `@ai-sdk/openai-compatible` + `includeUsage: true` **[tested]**; with the `nearai/<id>` router string it is empty **[tested]**.

`costUsd` = `inputTokens × input price + outputTokens × output price`, prices from `GET https://cloud-api.near.ai/v1/model/list` (cached by the engine).

`verification` (on `run.verified`), computed with `@nearai/inference-sdk` (`verifyResponse` per completion, after Gateway and model attestation) **[tested, #19]**:
- `{ "status": "verified", "level": "model_tee" | "gateway_tee", "completionIds": [...] }`: every model step verified. `model_tee` only if every step was signed inside the model TEE (`provider_tee`); streaming completions are signed by the Gateway TEE, so a normal chat run is `gateway_tee` (measured 3 Nov).
- `{ "status": "not_applicable", "reason": "incognito_model" | "no_completions" }`: Incognito models (`verifiable: false` in the model list) never get the private badge.
- `{ "status": "failed", "completionIds": [...], "errors": [...] }`: show no badge.

UI wording: `model_tee` → "Verified private (model TEE)"; `gateway_tee` → "Verified via NEAR AI TEE gateway"; anything else → no badge.

Builder runs (#20) send `workflow.started → node.started/node.finished… → workflow.finished → run.verified`. Inside an `agent` node the chat events appear between its `node.started` and `node.finished` (`step.*`, `reasoning.delta`, `text.delta`, `tool.*`), but no `run.started` / `run.finished`. A run with no agent node ends with `run.verified` `{ status: "not_applicable", reason: "no_completions" }`. Condition nodes emit nothing; only the branch that ran appears.

Example sequence for one tool call **[tested shape]**:

```text
run.started → step.started{1} → reasoning.delta… → tool.called{addNumbers} → tool.result{addNumbers}
→ step.finished{1} → step.started{2} → text.delta… → step.finished{2} → run.finished
```

### Not forwarded to the browser

`tool-call-input-streaming-start`, `tool-call-delta`, `tool-call-input-streaming-end`, `text-start`, `text-end`, `reasoning-start`, `reasoning-end`, `raw` **[tested]**. The engine drops them; nothing in the UI needs partial tool arguments.

### Secrets in events

No event may contain a secret value. The engine redacts known secret **values** (not just field names) in every event field, including `run.error`, before emitting, replacing them with `"••••"` **[tested, #18]**.

## 4. Mind Graph mapping

Each event with a `nodeId` lights up one node. Node ids are stable across runs so the history graph accumulates.

| Node | `nodeId` | Created from |
|---|---|---|
| Mind | `mind:{mindId}` | always (center) |
| Tool | `tool:{toolKey}` | `tool.*` events |
| Skill | `skill:{skillId}` | when the agent loads a skill: Mastra tool `skill` (`args.name`) or `skill_read` (`args.skillName`) **[tested, #13]**; `skill_search` stays a tool node |
| Wallet | `wallet:{mindId}` | wallet tools (`pay_invoice`, `get_balance`, …) |
| App | `app:{appName}` | app tools named `<app>_<action>`: `gmail_*` → `app:gmail` **[tested]** |
| Model | `model:{modelId}` | `run.started` |
| Memory | `memory:{mindId}` | memory tools |
| Other Mind | `mind:{otherMindId}` | subagent delegation |
| Workflow | `workflow:{workflowId}` | `workflow.started` (#20); its `agent` nodes light up `mind:{mindId}`, `tool`/`http` nodes light up their `tool:{toolKey}` |

**`toolKey` is the key in the agent's `tools` object, which is what Mastra puts in `payload.toolName`, not the tool's `id` [tested].** The engine registers each tool under a key equal to its `id` so the two never differ.

Edge = one call from `mind:{mindId}` to the node, coloured by status: `running` (after `tool.called`), `ok`, `error`, `policy_denied`, `awaiting_approval`.

## 5. Backend database (initial schema)

Postgres + pgvector. Mastra keeps its own tables (memory, threads, workflow snapshots) in a separate schema `mastra`; the backend never writes to it.

| Table | Columns | Notes |
|---|---|---|
| `users` | `id`, `near_account_id` (unique), `created_at` | from NEP-413 login |
| `minds` | `id`, `user_id`, `template_id`, `name`, `soul` (jsonb), `model`, `outlayer_wallet_id`, `created_at`, `updated_at` | `soul` = identity, invariants, priors |
| `skills` | `id`, `name`, `skill_md`, `tool_bindings` (jsonb), `required_connections` (jsonb), `permissions` (jsonb), `version` | `permissions` = apps, actions, per-transaction limit, secrets + allowed hosts |
| `mind_skills` | `mind_id`, `skill_id`, `position`, `granted_at`, `sub_wallet_id`, `revoked_at` | equipped skills in order; one OutLayer sub-wallet per wallet-using skill (#15) |
| `runs` | `id` (= Mastra `runId`), `mind_id`, `thread_id`, `workflow_id`, `status`, `model`, `usage` (jsonb), `cost_usd`, `started_at`, `finished_at`, `user_message` (the chat message that started the run, #54) | `status`: `running`, `awaiting_approval`, `finished`, `error`, or a builder run's `workflow.finished` status (`success`, `failed`, …) |
| `run_events` | `run_id`, `seq`, `type`, `node_id`, `payload` (jsonb), `ts` | PK `(run_id, seq)`; source for the Mind Graph and Receipts |
| `secrets` | `id`, `user_id`, `name`, `ciphertext`, `allowed_hosts` (text[]), `created_at`, `updated_at` | AES-256-GCM, AAD `user_id:name`; value never leaves the backend in clear except into the engine for a run (#18) |
| `mind_wallets` | `mind_id` (pk, → `minds`), `wallet_id`, `near_account_id`, `key_ciphertext`, `created_at` | One OutLayer wallet per Mind (#14, #15). The agent key is AES-256-GCM, AAD `wallet:{mind_id}`; the `handoff_url` is never stored. `minds.outlayer_wallet_id` is unused |
| `wallet_payments` | `id`, `mind_id` (→ `minds`), `to_account`, `amount_yocto`, `status` (`pending`/`sent`/`policy_denied`/`wallet_frozen`/`failed`), `tx_hash`, `outlayer_request_id`, `message`, `created_at`, `updated_at` | Receipts of the payment tools (#42); refusals have no `tx_hash` |
| `users.is_demo` | `boolean`, default `false` | Judge try-out users (#43), `near_account_id` = `demo:<random>`; deleted with their data after 7 days |
| `auth_nonces` | `nonce`, `expires_at`, `used_at` | NEP-413 challenges, single use, 5 minutes |
| `sessions` | `token_hash`, `user_id`, `created_at`, `expires_at` | only the SHA-256 of the cookie value |
| `autopilots` | `mind_id`, `workflow_id`, `input` (jsonb), `enabled` | the Autopilot input last sent, to resend the Mind config when the Mind changes (#21) |

Index `run_events (run_id, seq)` and `runs (mind_id, started_at desc)`. Migrations: `apps/be/migrations/` (implemented, #8).

## 6. Open questions for James

1. SSE between backend and engine, or a queue? **Decided (James, 4 Nov): direct SSE.** The backend reads the engine stream to the end even if the browser leaves, so `run_events` stays complete (load test: 1,377 runs, none missing events).
2. Does the backend send the full Mind config each request, or should the engine read `minds` itself? **Decided: the backend sends it** (the engine has no access to backend tables).
3. Run timeout: **kept** at Mastra `modelSettings.timeout.totalMs = 120000`. The backend sends an SSE comment (`: ping`) every 15 s so proxies do not close a quiet stream.
4. Autopilot and secrets (#21): scheduled runs cannot get secrets today. Option: the engine asks the backend for a Mind's secrets at execution (an internal endpoint authenticated with the engine key), never storing them. Needed before a scheduled workflow can call an authenticated API.

## 7. Backend HTTP API (called by the browser)

Implemented in `apps/be` (#8). Base URL `http://localhost:4000` locally. JSON bodies (at most 256 KB). Errors are `{ error, ...details }` with the status below. Every route except health and auth needs the session cookie `hn_session` (send requests with `credentials: 'include'`). CORS allows only `FE_ORIGIN` with credentials; a state-changing request whose `Origin` is not `FE_ORIGIN` gets `403 bad_origin`. Another user's Mind or run answers `404`.

### Auth (NEP-413)

| Method and path | Body | Response |
|---|---|---|
| `POST /v1/auth/challenge` | | `{ message: "Sign in to HelloNear", recipient, nonce }` (`nonce` = 32 bytes base64, single use, 5 min) |
| `POST /v1/auth/login` | `{ accountId, publicKey: "ed25519:…", signature: base64, nonce }` | `200 { user: { id, nearAccountId } }` + `Set-Cookie: hn_session` (7 days), or `401 invalid_nonce \| invalid_signature` |
| `POST /v1/auth/demo` | `{}` | Judge try-out mode (#43), only when the backend runs with `DEMO_MODE=true` (else `404`): `201 { user: { id, nearAccountId: "demo:…", demo: true } }` + the same cookie. A new user each time; `429 demo_rate_limited` after 10 per IP per hour **[tested]** |
| `POST /v1/auth/logout` | | `204` |
| `GET /v1/me` | | `{ user }` or `401`; `user.demo: true` for a try-out user |

**Try-out users (#43)** have no wallet login. Their limits: 20 runs each (chat, approve/decline, builder runs; then `429 demo_run_limit { limit }`), 60 runs per IP per hour (`429 demo_rate_limited`), at most 2 sent payments each. Owner actions answer `403 { error: "demo_not_allowed", action }` with `action` = `secrets` \| `create_wallet` \| `set_policy` \| `freeze` \| `autopilot`: show "connect a wallet to do this". Their Minds pay from one shared demo wallet (`GET …/wallet` shows `shared: true`; it already has policy v2). Demo users and everything they made are deleted after 7 days.

The FE asks the wallet (NEAR Connect `signMessage`, Meteor first) to sign exactly `{ message, recipient, nonce }` from the challenge, then posts the wallet's `accountId`, `publicKey` and `signature` with the same `nonce`. The key must be a full-access key of the account (checked on the RPC). Login is tested with real NEP-413 signatures and a faked RPC lookup; a Meteor login from the FE is **not proven yet**.

### Minds and templates

| Method and path | Body | Response |
|---|---|---|
| `GET /v1/templates` | | `{ templates }` (engine §2, cached 60 s) |
| `GET /v1/skills` | | `{ skills }` (engine §2, cached 60 s): what the skill picker offers. `POST`/`PATCH /v1/minds` validate `skills` against this list, so skills no template starts with (`near-account`, `http-request`) can be equipped **[tested]** |
| `GET /v1/minds` | | `{ minds: [Mind] }`, newest first |
| `POST /v1/minds` | `{ templateId, name, soul?, model?, skills?: [skillId] }` | `201 { mind }`; omitted fields come from the template. `400 unknown_template \| unknown_skill \| duplicate_skill \| invalid_body` |
| `GET /v1/minds/{mindId}` | | `{ mind }` |
| `PATCH /v1/minds/{mindId}` | any of `{ name, soul, model, skills }` | `{ mind, autopilot: [{ workflowId, status, autopilot, issues? }] }`: the new config was sent to every Autopilot workflow; `status: 409` means the engine paused it (show `issues`) |
| `DELETE /v1/minds/{mindId}` | | `204`; also deletes its workflows and schedules in the engine |

`Mind` = `{ id, templateId, name, soul: { identity, invariants, priors }, model, skills: [skillId], outlayerWalletId, createdAt, updatedAt }`.

### Mind wallet (#14, #15)

One OutLayer wallet per Mind, on testnet. The backend keeps the agent key and never returns it or the `handoff_url`. Owner actions are calls on `outlayer.testnet` that the **owner signs in the FE** with NEAR Connect (`signAndSendTransaction(transaction)`, signer = the signed-in account); the backend only builds them. After the owner signs, read `GET …/wallet` again for the new state.

| Route | Body | Answer |
|---|---|---|
| `POST /v1/minds/{mindId}/wallet` | `{}` | `201 { wallet }`; `409 wallet_exists` **[tested; live on testnet, 5 Nov]** |
| `GET /v1/minds/{mindId}/wallet` | | `{ wallet: { address, shared, balanceNear, frozen, policy: null \| { perTransactionNear, whitelist, transactionTypes, boundToThisWallet } } }`; `404 no_wallet`. `address` is the wallet's implicit NEAR account: fund it from the owner's wallet before it can pay **[tested]** |
| `POST /v1/minds/{mindId}/wallet/policy` | `{ perTransactionNear: "0.05", whitelist: ["shop.testnet", …] }` | `{ transaction }` for `store_wallet_policy` (100 Tgas, deposit from the contract's `estimate_wallet_policy_cost`). Builds policy v2: per-transaction limit (≤ 10 NEAR), whitelist (1–20 accounts), `transfer` only, OutLayer approval off (the app approves), bound to this wallet's key, approver = the owner **[tested; built live on testnet; owner signing not run yet]** |
| `POST /v1/minds/{mindId}/wallet/freeze`, `…/unfreeze` | `{}` | `{ transaction }` for `freeze_wallet` / `unfreeze_wallet` (30 Tgas, no deposit). A frozen wallet's transfers get `403 wallet_frozen` before signing **[tested]** |
| `GET /v1/minds/{mindId}/wallet/payments?limit=20` | | `{ payments }`, the same receipts the engine's `list_payments` reads (Receipts screen) **[tested]** |

`transaction` = `{ receiverId: "outlayer.testnet", actions: [{ type: "FunctionCall", params: { methodName, args, gas, deposit } }] }`. OutLayer down or refusing → `502 outlayer_error`. Deleting a Mind deletes its wallet row: move the balance out first (a later route will do it).

### Chat, runs and the approval inbox

| Method and path | Body | Response |
|---|---|---|
| `POST /v1/minds/{mindId}/chat` | `{ message, threadId? }` | SSE of §3 events (plus `: ping` comments). Omit `threadId` for a new thread; `run.started.threadId` gives it. A `threadId` must belong to this Mind (`404 thread_not_found`). Engine `4xx` answers come back as JSON with the same status |
| `GET /v1/minds/{mindId}/runs?threadId&limit=20` | | `{ runs: [{ runId, threadId, workflowId, status, model, usage, costUsd, startedAt, finishedAt }] }` |
| `GET /v1/runs/{runId}` | | `{ run, events }` (all stored events, in `seq` order) |
| `GET /v1/minds/{mindId}/events?since=ISO&limit=2000` | | `{ events }` across runs since `since` (default 7 days), deltas left out: Mind Graph history mode (#17) |
| `GET /v1/minds/{mindId}/approvals` | | `{ approvals: [{ runId, threadId, toolCallId, tool, args, requestedAt }] }`: runs paused on `tool.approval_required` (#14) |
| `POST /v1/runs/{runId}/approve` · `/decline` | `{ toolCallId, reason? }` | SSE continuing the run's `seq`. `409 not_awaiting_approval` unless the run waits for that `toolCallId` |
| `GET /v1/minds/{mindId}/threads?limit=20` | | Chat threads (#54), newest first: `{ threads: [{ threadId, title, lastMessageAt, messageCount }] }`. `title` is the first user message cut to ~60 characters (ending with `…`), or `null` for a thread from before the backend kept user messages; Mastra keeps no titles. Builder runs have no thread **[tested]** |
| `GET /v1/minds/{mindId}/threads/{threadId}/messages?limit=50&before=ISO` | | `{ messages: [{ id, role: "user" \| "assistant", text, createdAt, runId }], nextBefore }`, oldest first. One user message per chat run and one assistant message per run that wrote text (a run resumed after approval adds to its reply). Pages hold whole runs, newest first: pass `nextBefore` as `before` for older ones (`null` = no more). `404 thread_not_found` for another Mind's or an unknown thread, `400 invalid_before` **[tested]**. No delete route yet: the engine's thread memory would stay behind |

The backend stores every event before forwarding it and reads the engine stream to the end even if the browser disconnects: reload and fetch `GET /v1/runs/{runId}` to recover.

### Secrets (#18)

| Method and path | Body | Response |
|---|---|---|
| `GET /v1/secrets` | | `{ secrets: [{ name, allowedHosts, createdAt, updatedAt }] }` (never values) |
| `PUT /v1/secrets/{NAME}` | `{ value, allowedHosts: ["api.example.com"] }` | `{ secret }` (summary). `NAME` is `UPPER_SNAKE_CASE`; hosts are lowercase host names without scheme, port or path; value ≥ 4 characters |
| `DELETE /v1/secrets/{NAME}` | | `204` or `404` |

All of the user's secrets are sent to the engine for every chat, approval and builder run (account level, v1). Autopilot runs get none (§6 q4).

### App connections through Composio (#13)

The owner connects an app (`gmail` or `googlecalendar`, #57) once per account; Composio stores and refreshes the OAuth tokens. The Composio user id is the backend user id, the same `userId` the engine already gets on every run, so the engine opens a Composio session for that user and its Gmail tools act on that user's account only. Tokens never reach the backend, the browser or the model.

| Route | Body | Answer |
|---|---|---|
| `GET /v1/connections` | | `{ connections: [{ toolkit: "gmail" \| "googlecalendar", status: "connected" \| "pending" \| "expired" \| "not_connected", since? }] }` (no Composio ids) **[tested]** |
| `POST /v1/connections/{toolkit}` | `{}` | `{ redirectUrl }`: a Composio Connect Link (`https://connect.composio.dev/…`). Open it in the browser; after sign-in Composio sends the owner to `{FE_ORIGIN}/connections?toolkit={toolkit}&status=success\|failed`, then the FE reads `GET /v1/connections` (the query string proves nothing). An unfinished attempt is replaced. `409 already_connected` **[tested; live against Composio, 5 Nov]** |
| `DELETE /v1/connections/{toolkit}` | | `204` (Composio deletes the connection and its tokens) or `404` **[tested]** |

Unknown toolkit → `404 unknown_toolkit`; Composio down or refusing → `502 composio_error`; no `COMPOSIO_API_KEY` → `503 composio_not_configured`.

### Visual Builder and Autopilot (#20, #21)

Same paths and bodies as the engine (§2), under `/v1/minds/{mindId}/workflows…`, after the ownership check. The backend adds `userId`, the Mind config and secrets, so the browser sends only:

- `POST …/workflows/{workflowId}/runs`: `{ input? }` → SSE (stored like chat runs, `run.workflowId` set).
- `PUT …/workflows/{workflowId}/autopilot`: `{ input?, enabled? }` → engine answer as is (`200` or `409 cannot_autopilot`).
