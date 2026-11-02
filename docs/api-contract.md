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

All bodies are JSON. All ids are strings.

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
- Response: SSE stream of events (§3). The first event is `run.started` and carries `runId`.

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

`{ "templates": [ { templateId, name, tagline, soul, model, skills: [ { skillId, description, status: "available" | "simulated" | "blocked", connections: [...], note? } ] } ] }` for the Choose a Mind screen. Status tells the UI what is simulated (e.g. payments before OutLayer) or blocked (e.g. email before Composio) **[tested, #13]**.

### `GET /v1/health`

`{ "ok": true, "mastra": "1.81.0" }`

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
| `tool.error` | `toolCallId`, `tool`, `nodeId`, `status: "error" \| "policy_denied"`, `error`, `rule?` | `tool-error` **[docs]**; `policy_denied` when the wallet tool gets an OutLayer policy rejection (#6) |
| `tool.approval_required` | `toolCallId`, `tool`, `nodeId`, `args` | `tool-call-approval` **[tested, #11]** |
| `step.finished` | `step`, `usage` | `step-finish` **[tested]** |
| `run.finished` | `finishReason`, `text`, `usage`, `costUsd`, `verification` | `finish` **[tested]** |
| `run.error` | `error` | `error` chunk or a thrown error |

`usage` = `{ "inputTokens": 441, "outputTokens": 28, "reasoningTokens": 2, "totalTokens": 469 }`. It is only filled while streaming when the engine builds models with `@ai-sdk/openai-compatible` + `includeUsage: true` **[tested]**; with the `nearai/<id>` router string it is empty **[tested]**.

`costUsd` = `inputTokens × input price + outputTokens × output price`, prices from `GET https://cloud-api.near.ai/v1/model/list` (cached by the engine).

`verification` = `{ "status": "verified" | "unverified" | "not_applicable", "model": "…" }`. Filled by #19; `not_applicable` for Incognito models, which never get the badge.

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
| App | `app:{appName}` | Composio tools (e.g. `app:gmail`) |
| Model | `model:{modelId}` | `run.started` |
| Memory | `memory:{mindId}` | memory tools |
| Other Mind | `mind:{otherMindId}` | subagent delegation |

**`toolKey` is the key in the agent's `tools` object, which is what Mastra puts in `payload.toolName`, not the tool's `id` [tested].** The engine registers each tool under a key equal to its `id` so the two never differ.

Edge = one call from `mind:{mindId}` to the node, coloured by status: `running` (after `tool.called`), `ok`, `error`, `policy_denied`, `awaiting_approval`.

## 5. Backend database (initial schema)

Postgres + pgvector. Mastra keeps its own tables (memory, threads, workflow snapshots) in a separate schema `mastra`; the backend never writes to it.

| Table | Columns | Notes |
|---|---|---|
| `users` | `id`, `near_account_id` (unique), `created_at` | from NEP-413 login |
| `minds` | `id`, `user_id`, `template_id`, `name`, `soul` (jsonb), `model`, `outlayer_wallet_id`, `created_at`, `updated_at` | `soul` = identity, invariants, priors |
| `skills` | `id`, `name`, `skill_md`, `tool_bindings` (jsonb), `required_connections` (jsonb), `permissions` (jsonb), `version` | `permissions` = apps, actions, per-transaction limit, secrets + allowed hosts |
| `mind_skills` | `mind_id`, `skill_id`, `granted_at`, `sub_wallet_id`, `revoked_at` | one OutLayer sub-wallet per wallet-using skill (#15) |
| `runs` | `id` (= Mastra `runId`), `mind_id`, `thread_id`, `status`, `model`, `usage` (jsonb), `cost_usd`, `started_at`, `finished_at` | |
| `run_events` | `run_id`, `seq`, `type`, `node_id`, `payload` (jsonb), `ts` | PK `(run_id, seq)`; source for the Mind Graph and Receipts |
| `secrets` | `id`, `user_id`, `name`, `ciphertext`, `allowed_hosts` (text[]), `created_at` | value never leaves the backend in clear except into the engine at tool execution (#18) |

Index `run_events (run_id, seq)` and `runs (mind_id, started_at desc)`.

## 6. Open questions for James

1. SSE between backend and engine, or a queue? Draft assumes direct SSE (simplest for the hackathon).
2. Does the backend send the full Mind config each request (draft), or should the engine read `minds` itself?
3. Run timeout: draft uses Mastra `modelSettings.timeout.totalMs = 120000`.
