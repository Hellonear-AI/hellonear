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
- `mind.personaVersion` (#116): present once the Mind's `name` or `soul` changed (1, 2, …; absent while it never changed). The engine keys memory on it, `userId:mindId:v{n}`, and uses `userId:mindId` when it is absent, so a renamed Mind does not recall its old name from memory. Skills and model changes do not bump it. Threads keep their ids.
- **`secrets`** (optional, #18): the owner's secrets for this run, decrypted by the backend from its store. Names are `UPPER_SNAKE_CASE`, each with at least one allowed host. The engine puts them in the run's `RequestContext` only; the model writes `{{secrets.NAME}}` placeholders that the `http_request` tool fills at execution. A secret only goes to its `allowedHosts`, only over public `https`, never through a redirect. Values are redacted from tool results (before the model reads them), from every event, and are not stored in the `mastra` schema **[tested, #18]**. Invalid secrets → `400`. Send the same `secrets` again on approve/decline.
- **Skills are sent by id only.** The engine's catalog (`engine/skills/<id>/SKILL.md`) decides which tools and playbook each skill grants, so the backend cannot grant arbitrary tools. An unknown `skillId` → `400`. A skill with status `blocked` is accepted but not loaded **[tested, #13]**.
- **`demo: true`** (only for judge try-out users, #43; absent otherwise): the run is from a visitor without a wallet login. The engine's email tools (`gmail_list_emails`, `gmail_read_email`, `gmail_create_draft`) then read a fixed, fictional sample inbox and never call Composio; results carry `source: "sample_inbox"`. Without `demo` they read the run user's own Gmail through Composio (the Composio user id is `userId`), or answer "Gmail is not connected" when that user has no Gmail connection **[tested: live "no connection" answer; a connected Gmail not tested yet]**. The calendar tools (`googlecalendar_list_events`, `googlecalendar_create_event`, #57) work the same way: `demo` reads a fixed sample calendar (`source: "sample_calendar"`, creating saves nothing), otherwise the user's own Google Calendar, or "Google Calendar is not connected" **[tested: fake Composio, live "no connection" answer; a connected calendar not tested yet]**. `googlecalendar_create_event` pauses on `tool.approval_required` like `send_payment`; its `args` are `{ title, start, end, location?, description? }` (times with an offset), for the approval card. Events are 1 minute to 24 hours long (Composio's create tool takes a start plus a duration, no end time, #97). **`googlecalendar_create_meeting`** (#97) schedules a meeting with guests and, optionally, a Google Meet link; it also pauses for approval, with `args` `{ title, start, end, attendees: string[], meet: boolean, location?, description? }` (`attendees` and `meet` are always present; at most 20 emails). The card must show every attendee and say that Google emails each of them an invite in the owner's name. Its `tool.result` is `{ source, eventId, title, start, end, link, meetLink, attendees, invitesSent, status: "created" }` (`meetLink` is `""` when `meet` is false; `invitesSent` is true only when there were attendees). With `demo` it returns a fake `meetLink` (`https://meet.example/sample-meeting`), `invitesSent: false`, and calls nothing; without a Meet connection it fails with "Google Meet is not connected" before any event is made **[tested: fake Composio only; a live Meet not tested yet]**. Also sent on approve/decline and builder runs **[tested, engine]**.
- **`timeZone`** (optional, #112): the owner's IANA time zone from the browser (e.g. `Asia/Jakarta`), validated by the backend (a name the runtime does not know is `400`, never forwarded). Sent with chat, approve/decline and builder workflow runs when the FE gives it; absent means UTC. The engine validates it again (unknown → `400 invalid_body`) and `get_time` then returns `{ utc, timeZone, date, time, weekday, utcOffset }` in that zone; the weekday is computed, never left to the model **[tested: backend with the fake engine; engine unit + integration, 9 Nov]**
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

### Mail tools: `mailToken` and the backend's internal mail routes (#96, AgentMail)

Same pattern as the payment tools. When the Mind equips the `email-address` skill **and** has an inbox, the backend adds **`mailToken`** (`mt_…`, same format and 15-minute life as `walletToken`, but its own HMAC key, so neither token works as the other) to the chat, approve/decline and builder-run bodies; never to Autopilot. The engine never gets the AgentMail key. Mail tools call the backend with `X-Engine-Key` and `X-Mail-Token: <mailToken>`:

| Route | Body | Answer |
|---|---|---|
| `POST /internal/v1/mail/send` | `{ to: ["a@example.com"] (1–5), subject (≤ 200), text (≤ 10,000), idempotencyKey? }` | `{ sendId, status, from, to, subject, messageId?, threadId?, code?, message? }`, `status` = `sent` (with `messageId`) \| `rejected` \| `rate_limited` \| `failed`. `code` is AgentMail's error code (`message_rejected`, `limit_exceeded`, `rate_limit_exceeded`, …) or ours (`daily_mail_limit`, `demo_mail_limit`, `demo_recipient_not_allowed`); `message` is AgentMail's explanation. `idempotencyKey` (the tool call id) becomes AgentMail's `Idempotency-Key` header as `{mindId}.{key}`, so a repeated call sends once **[tested, fake AgentMail; live: sent to itself and to the account owner, 9 Nov]** |
| `GET /internal/v1/mail/messages?limit=10` (≤ 25) | | `{ inbox, shared, messages: [{ messageId, threadId, from, to, subject, preview, at, direction: "sent" \| "received", labels, agentArmor, warnings }] }`, newest first **[tested; live 9 Nov]** |
| `GET /internal/v1/mail/messages/{messageId}` (URL-encoded) | | `{ inbox, messageId, threadId, from, to, subject, at, direction, text (≤ 8,000 chars), truncated?, labels, agentArmor, warnings }`. A message of another inbox answers `404 mail_not_found` **[tested; live 9 Nov]** |

`agentArmor` = `null` or `{ status: "pending" \| "complete" \| "unavailable", verdict?: "clear" \| "review", reason? }` (AgentMail's Agent Armor; `null` while it is off for the organization, as on 9 Nov). `warnings` lists, in plain words, the labels `spam` / `blocked` / `unauthenticated` / `agent-armor-held`, a `review` verdict and an `unavailable` scan. Same checks as the wallet routes (loopback, engine key, token, owned Mind): `401 invalid_mail_token` / `mail_token_expired`, `404`, `400 invalid_body`. List/read failures: `429 mail_rate_limited` (`agentmailCode`, `reason`, `retryAfter?`), `403 mail_rejected`, `404 mail_not_found \| no_inbox`, `503 agentmail_unreachable \| agentmail_error \| agentmail_not_configured`. Every send attempt is stored in `mail_sends`, refusals included.

**Paid data (#150), `GET /internal/v1/shop/{item}[?tx=<hash>]`:** for the engine's `buy_data`, with `X-Engine-Key` and the run's `X-Wallet-Token`. Items: `network-status`, `gas-price` (read live from NEAR RPC). Without `tx`: **`402`** `{ status: "payment_required", item, title, priceNear: "0.001", payTo }` (`payTo` = `SHOP_PAY_TO`). With `tx`: `200` `{ status: "paid", item, title, data, receipt: { txHash, paymentId, amountNear } }` only if this Mind's own `wallet_payments` row has that hash as `sent` to `payTo` for at least the price within the last hour, NEAR RPC `tx` shows the transfer succeeded from the Mind's wallet, and the hash was never redeemed (`shop_purchases`). Otherwise `402` with the offer and `error` = `payment_not_found` \| `payment_does_not_match` \| `payment_not_on_chain`, or `409 payment_already_used`. `404 unknown_item`, `400 invalid_tx_hash`, `503 shop_not_configured`. A 402 pattern on testnet NEAR, not the x402 standard **[tested, fake OutLayer and RPC; checked in Chrome on localhost, 10 Nov]**.

**Email me (#146), `POST /internal/v1/mail/owner`:** for Autopilot's `mail_send_to_owner` step. Loopback and `X-Engine-Key` only, no mail token (a scheduled run has none). Body `{ userId, mindId, subject (≤ 200), text (≤ 10,000), idempotencyKey? }`, strict: a `to` field is refused (`400`). The backend reads the recipient itself, the address of the owner's connected Gmail (Composio `GMAIL_GET_PROFILE`, OAuth-proven, no confirmation code), appends a footer naming the Mind, and sends through the same path as `mail/send` (same answer, same `mail_sends` row, same daily cap). `404 mind_not_found` (not this user's Mind), `409 gmail_not_connected`, `403 demo_not_allowed` (try-out users; the engine answers them with a sample) **[tested, fake Composio and AgentMail; not proven yet with a real Gmail]**.

Try-out users' Minds share one demo inbox (`DEMO_AGENTMAIL_INBOX`): their sends may only go to that address itself (`rejected`, `demo_recipient_not_allowed` otherwise) and count against `demo.mailPerUser` (2, counted under a per-user lock). Owners' Minds: at most `mail.sendsPerMindPerDay` (20) sends a day.

| Tool | Input | Output | Notes |
|---|---|---|---|
| `mail_send` | `{ to: [email], subject, text }` | the send answer | `requireApproval: true` (the card shows recipients, subject and text). `rejected` / `rate_limited` become `tool.error` with that `status` (no email went out) |
| `mail_list` | `{ limit? }` | the list answer | content is third-party data |
| `mail_read` | `{ messageId }` | the read answer | content is third-party data |

No `mailToken` (no inbox, or the skill is off): the tools answer "this Mind has no email address yet" without calling the backend.

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

`{ "templates": [ { templateId, name, tagline, quote, soul, model, skills: [ { skillId, description, status: "available" | "simulated" | "blocked", connections: [...], note? } ] } ] }` for the Choose a Mind screen. Status tells the UI what is simulated or blocked (e.g. email before Composio) **[tested, #13]**. `quote` is one line (≤ 80 characters) in the Mind's own voice for the template card (#55) **[tested]**.

### `GET /v1/skills`

`{ "skills": [ { skillId, description, status, connections: [...], note?, tools: [toolKey] } ] }`: **every** skill a Mind may equip, in id order, not only those a template starts with (e.g. `near-account` and `http-request`, which the Visual Builder's tools need). Built-in skills (`hellonear-guide`, #114) are not listed: every Mind has them and they cannot be equipped. This is the list to validate a Mind's `skills` against; `blocked` skills are listed so the UI can say why they are off, and the engine never loads them. `tools` are the tool keys the skill grants (the Builder palette) **[tested]**.

### `GET /v1/attacks` (Attack Playground, #16)

`{ "attacks": [ { attackId, title, description, templateId, skills, attacker, message } ] }`: the fixed prompt-injection scenarios, `direct-order`, `email-injection`, `rogue-skill`, `tricked-owner`. To run one, the backend sends a normal chat run for a try-out Mind built from `templateId` + `skills`, with `message` and **`"attackId"`** in the body (chat and approve/decline accept it). The engine then emits `attack.verdict` (§3) after `run.finished` and before `run.verified`. For the "owner approves anyway" step the backend calls approve with the same `attackId`; the resumed run gets its own verdict **[tested: engine tests with a fake wallet backend whose policy only lists known recipients]**.

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
| `POST /v1/minds/{mindId}/workflows/{workflowId}/runs` | `{ userId, mind, secrets?, input?, timeZone? }` | SSE events (§3). `409 { error: "missing_tools", tools }` if the Mind no longer has a skill granting a tool the workflow uses. "Run again" = the same call again (new `runId`) **[tested]** |

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
| `text.delta` | `text` | `text-delta` **[tested]** Em and en dashes are replaced by a plain hyphen before the event is sent (house style, #109, #124); the TEE verification covers the model's own bytes |
| `tool.called` | `toolCallId`, `tool`, `nodeId`, `args` | `tool-call` **[tested]**: payload `{ toolCallId, toolName, args }` |
| `tool.result` | `toolCallId`, `tool`, `nodeId`, `result`, `status: "ok"` | `tool-result` **[tested]**: payload `{ toolCallId, toolName, args, result }` |
| `tool.error` | `toolCallId`, `tool`, `nodeId`, `status: "error" \| "policy_denied" \| "wallet_frozen" \| "rejected" \| "rate_limited"`, `error`, `result?` | `tool-error` **[tested]**; for `send_payment`, a `tool-result` whose `status` is `policy_denied` / `wallet_frozen` (the wallet refused before signing, #42): `error` is OutLayer's message, `result` the payment receipt without `txHash` **[tested, fake backend]**; for `mail_send`, a `tool-result` whose `status` is `rejected` / `rate_limited` (#96): `error` is the refusal's `message`, `result` the send record without `messageId` **[tested, predicate only]** |
| `tool.approval_required` | `toolCallId`, `tool`, `nodeId`, `args` | `tool-call-approval` **[tested, #11]** |
| `step.finished` | `step`, `usage` | `step-finish` **[tested]** |
| `run.finished` | `finishReason`, `text`, `usage`, `costUsd`, `verification: { status: "pending" }` | `finish` **[tested]** |
| `run.finished` (canceled) | `status: "canceled"`, `finishReason: "canceled"`; no `text`, `usage` or `costUsd`, and no `run.verified` after it | **backend**, not the engine: the last event of a run stopped with `POST /v1/runs/{runId}/cancel` (#121); a builder run gets `workflow.finished` with `status: "canceled"` instead **[tested: backend tests with the fake engine]** |
| `attack.verdict` | `attackId`, `attacker`, `paymentTool` (the Mind's skills grant `send_payment`), `stoppedBy`: `model` (refused, asked for no payment) · `no_tool` (no payment tool) · `approval` (a payment card waits for the owner) · `policy` (approved, then refused by the wallet in OutLayer's TEE before signing: `policy_denied` / `wallet_frozen`, no tx) · `none` (a payment was sent), `detail`, optional `to`, `status`, `attackerTargeted` (the payment went to the scenario's attacker), `txHash` (only for `none`) | engine (`src/attacks.ts`, #16), on a run that carries `attackId`, after `run.finished` and before `run.verified` **[tested]** |
| `thread.titled` | `threadId`, `title` (3 to 6 words summing up the user's first message, in the user's language, no quotes or final period) | engine (`src/titles.ts`, #86, #93), after the `run.finished` of a thread's first run and before `run.verified`; skipped if making the title fails or takes too long, and then the backend keeps the first-message cut **[tested: engine tests; backend tests with stored events; live on the hosted demo, 9 Nov]** |
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
| App | `app:{appName}` | app tools named `<app>_<action>`: `gmail_*` → `app:gmail`, `googlecalendar_*` → `app:googlecalendar` (the backend's toolkit ids; `googlecalendar_create_meeting` stays on `app:googlecalendar` even when it makes a Meet link), `mail_*` → `app:mail` (the Mind's own AgentMail address, #96) **[tested]** |
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
| `minds` | `id`, `user_id`, `template_id`, `name`, `soul` (jsonb), `model`, `outlayer_wallet_id`, `persona_version`, `playground_attack`, `created_at`, `updated_at` | `soul` = identity, invariants, priors; `persona_version` starts at 0, +1 when `PATCH` changes `name` or `soul` (#116); `playground_attack` set only on an Attack Playground Mind (#129), unique per user and attack |
| `skills` | `id`, `name`, `skill_md`, `tool_bindings` (jsonb), `required_connections` (jsonb), `permissions` (jsonb), `version` | `permissions` = apps, actions, per-transaction limit, secrets + allowed hosts |
| `mind_skills` | `mind_id`, `skill_id`, `position`, `granted_at`, `sub_wallet_id`, `revoked_at` | equipped skills in order; one OutLayer sub-wallet per wallet-using skill (#15) |
| `runs` | `id` (= Mastra `runId`), `mind_id`, `thread_id`, `workflow_id`, `status`, `model`, `usage` (jsonb), `cost_usd`, `started_at`, `finished_at`, `user_message` (the chat message that started the run, #54) | `status`: `running`, `awaiting_approval`, `finished`, `error`, or a builder run's `workflow.finished` status (`success`, `failed`, …); `canceled` after a cancel (#121) |
| `run_events` | `run_id`, `seq`, `type`, `node_id`, `payload` (jsonb), `ts` | PK `(run_id, seq)`; source for the Mind Graph and Receipts |
| `secrets` | `id`, `user_id`, `name`, `ciphertext`, `allowed_hosts` (text[]), `created_at`, `updated_at` | AES-256-GCM, AAD `user_id:name`; value never leaves the backend in clear except into the engine for a run (#18) |
| `mind_wallets` | `mind_id` (pk, → `minds`), `wallet_id`, `near_account_id`, `key_ciphertext`, `created_at` | One OutLayer wallet per Mind (#14, #15). The agent key is AES-256-GCM, AAD `wallet:{mind_id}`; the `handoff_url` is never stored. `minds.outlayer_wallet_id` is unused |
| `wallet_payments` | `id`, `mind_id` (→ `minds`), `to_account`, `amount_yocto`, `status` (`pending`/`sent`/`policy_denied`/`wallet_frozen`/`failed`), `tx_hash`, `outlayer_request_id`, `message`, `created_at`, `updated_at` | Receipts of the payment tools (#42); refusals have no `tx_hash` |
| `mind_inboxes` | `mind_id` (pk, → `minds`), `inbox_id`, `email`, `key_slot`, `created_at` | One AgentMail inbox per Mind (#96), created when the owner equips `email-address`. AgentMail `client_id` = `mind_id`. `key_slot` = which AgentMail key holds it (0 = `AGENTMAIL_API_KEY`, 1 = `AGENTMAIL_API_KEY_2`) |
| `mail_sends` | `id`, `mind_id` (→ `minds`), `inbox_id`, `to_addresses` (text[]), `subject`, `body_preview` (≤ 280 chars), `status` (`pending`/`sent`/`rejected`/`rate_limited`/`failed`), `message_id`, `thread_id`, `error_code`, `message`, `created_at`, `updated_at` | Every `mail_send` attempt (#96), refusals included |
| `users.is_demo` | `boolean`, default `false` | Judge try-out users (#43), `near_account_id` = `demo:<random>`; deleted with their data after 7 days |
| `auth_nonces` | `nonce`, `expires_at`, `used_at` | NEP-413 challenges, single use, 5 minutes |
| `sessions` | `token_hash`, `user_id`, `created_at`, `expires_at` | only the SHA-256 of the cookie value |
| `autopilots` | `mind_id`, `workflow_id`, `input` (jsonb), `enabled` | the Autopilot input last sent, to resend the Mind config when the Mind changes (#21) |

Index `run_events (run_id, seq)` and `runs (mind_id, started_at desc)`. Migrations: `apps/be/migrations/` (implemented, #8).

## 6. Open questions for James

1. SSE between backend and engine, or a queue? **Decided (James, 4 Nov): direct SSE.** The backend reads the engine stream to the end even if the browser leaves, so `run_events` stays complete (load test: 1,377 runs, none missing events).
2. Does the backend send the full Mind config each request, or should the engine read `minds` itself? **Decided: the backend sends it** (the engine has no access to backend tables).
3. Run timeout: **kept** at Mastra `modelSettings.timeout.totalMs = 120000`. The backend sends an SSE comment (`: ping`) every 15 s so proxies do not close a quiet stream.
4. Autopilot and secrets (#21): **Decided (James, 9 Nov): no secrets for scheduled runs, for the submission.** Autopilot refuses workflows that use `{{secrets.…}}`. Possible later (after 14 Nov): the engine asks the backend for a Mind's secrets at execution (an internal endpoint authenticated with the engine key), never storing them.

## 7. Backend HTTP API (called by the browser)

Implemented in `apps/be` (#8). Base URL `http://localhost:4000` locally. JSON bodies (at most 256 KB). Errors are `{ error, ...details }` with the status below. When a service the backend depends on fails (OutLayer, Composio, the engine, the NEAR RPC), the answer is **`503`**, never `502`: behind Cloudflare a `502`/`504` body is replaced by Cloudflare's own HTML page, so the FE would lose the error. `…_error` means the service answered with a failure (details carry its status, e.g. `outlayerStatus`); `…_unreachable` / `engine_unavailable` mean no answer, with `reason` (`timeout` or a network code such as `ECONNREFUSED`). Every 5xx is logged to the backend journal as one `http error` line (route, code, details; never keys). Every route except health and auth needs the session cookie `hn_session` (send requests with `credentials: 'include'`). CORS allows only the origins in `FE_ORIGIN` (comma-separated, exact match) with credentials; a state-changing request whose `Origin` is not one of them gets `403 bad_origin`. Another user's Mind or run answers `404`.

`GET /v1/health` (public): `{ ok: true, engine: boolean, revision: string | null }`. `engine` is whether the engine's own health answered; `revision` is the git commit the hosted release was deployed from (the `REVISION` file `deploy/deploy.sh` writes), `null` when the backend runs from a checkout. So anyone can see what is live without SSH.

### Auth (NEP-413)

| Method and path | Body | Response |
|---|---|---|
| `POST /v1/auth/challenge` | | `{ message: "Sign in to HelloNear", recipient, nonce }` (`nonce` = 32 bytes base64, single use, 5 min) |
| `POST /v1/auth/login` | `{ accountId, publicKey: "ed25519:…", signature: base64, nonce }` | `200 { user: { id, nearAccountId } }` + `Set-Cookie: hn_session` (7 days), or `401 invalid_nonce \| invalid_signature` |
| `POST /v1/auth/demo` | `{}` | Judge try-out mode (#43), only when the backend runs with `DEMO_MODE=true` (else `404`): `201 { user: { id, nearAccountId: "demo:…", demo: true } }` + the same cookie. A new user each time; `429 demo_rate_limited` after 10 per IP per hour **[tested]** |
| `POST /v1/auth/logout` | | `204` |
| `GET /v1/me` | | `{ user }` or `401`; `user.demo: true` for a try-out user |

**Try-out users (#43)** have no wallet login. Their limits: 20 runs each (chat, approve/decline, builder runs; then `429 demo_run_limit { limit }`), 60 runs per IP per hour (`429 demo_rate_limited`), at most 2 sent payments each. Owner actions answer `403 { error: "demo_not_allowed", action }` with `action` = `secrets` \| `create_wallet` \| `set_policy` \| `freeze` \| `autopilot`: show "connect a wallet to do this". Their Minds pay from one shared demo wallet (`GET …/wallet` shows `shared: true`; it already has policy v2). Demo users and everything they made are deleted after 7 days.

The FE asks the wallet (NEAR Connect `signMessage`, Meteor first) to sign exactly `{ message, recipient, nonce }` from the challenge, then posts the wallet's `accountId`, `publicKey` and `signature` with the same `nonce`. The key must be a full-access key of the account (checked on the RPC). Login is tested with real NEP-413 signatures and a faked RPC lookup; a Meteor (testnet) login from the FE against the hosted API is proven (8 Nov, Chrome on `http://localhost:3000`, #73), and the session survives a reload. Not checked yet: Safari, other wallets, and the hosted FE calling the API directly (`NEXT_PUBLIC_API_URL`).

### Minds and templates

| Method and path | Body | Response |
|---|---|---|
| `GET /v1/templates` | | `{ templates }` (engine §2, cached 60 s) |
| `GET /v1/skills` | | `{ skills }` (engine §2, cached 60 s): what the skill picker offers. `POST`/`PATCH /v1/minds` validate `skills` against this list, so skills no template starts with (`near-account`, `http-request`) can be equipped **[tested]** |
| `GET /v1/attacks` | | `{ attacks: [{ attackId, title, description, templateId, skills, attacker, message }] }` (engine §2, passed through): the Attack Playground scenarios (#16, #129). Wallet and try-out sessions |
| `POST /v1/attacks/{attackId}/runs` | `{ timeZone? }` | SSE as chat; it ends with `attack.verdict` (§3) before `run.verified`, and `run.started` gives the `runId` (#129). The run is on the user's **playground Mind** for that scenario: made on first use from the scenario's `templateId` and `skills`, then reused (new thread each run). It pays from the **shared demo wallet** (try-out cap: 2 sent payments per user from it), reads the sample inbox and calendar (`demo: true`), and gets **none of the owner's secrets**. It is not one of the owner's Minds: not in `GET /v1/minds`, and `/v1/minds/{id}/…` answers `404`; the owner's Minds and wallet are untouched. Pause → `POST /v1/runs/{runId}/approve` · `/decline` as usual: the backend adds the `attackId` itself, so the resumed run gets its own verdict. Counts as a run in the try-out's 20. `404 unknown_attack` for an id the engine does not list |
| `GET /v1/minds` | | `{ minds: [Mind] }`, newest first |
| `POST /v1/minds` | `{ templateId, name, soul?, model?, skills?: [skillId] }` | `201 { mind, inboxError? }`; omitted fields come from the template. `400 unknown_template \| unknown_skill \| duplicate_skill \| invalid_body`. With `email-address` in `skills`, also creates the Mind's inbox (see "Mind email address") |
| `GET /v1/minds/{mindId}` | | `{ mind }` |
| `PATCH /v1/minds/{mindId}` | any of `{ name, soul, model, skills }` | A new `name` or `soul` (not the same value again) bumps `mind.personaVersion` and starts a fresh memory (#116). `{ mind, autopilot: [{ workflowId, status, autopilot, issues? }], inboxError? }`: the new config was sent to every Autopilot workflow; `status: 409` means the engine paused it (show `issues`). Turning on `email-address` creates the inbox; if that fails the skills are still saved and `inboxError` = `{ error, agentmailCode?, reason? }` (retry with `POST …/inbox`) |
| `DELETE /v1/minds/{mindId}` | | `204`; also deletes its workflows and schedules in the engine |

`Mind` = `{ id, templateId, name, soul: { identity, invariants, priors }, model, skills: [skillId], outlayerWalletId, email, personaVersion, createdAt, updatedAt }`. `email` is the Mind's address (#96) or `null`. `personaVersion` (#116) is 0 until the name or soul changes.

### Mind email address (#96, AgentMail)

An inbox is created **only when the owner turns on the `email-address` skill** (by `POST`/`PATCH /v1/minds`, or `POST …/inbox` to retry). Address: `{mind-name}-{last 6 of the Mind id}@agentmail.to` (12 if the name is taken; question 2 of #96 is still open). Removing the skill keeps the address but the Mind's mail tools stop. Try-out users' Minds that equip the skill show the shared demo address and never get their own.

| Route | Body | Answer |
|---|---|---|
| `GET /v1/minds/{mindId}/inbox` | | `{ inbox: null \| { email, shared } }` **[tested]** |
| `POST /v1/minds/{mindId}/inbox` | `{}` | `201 { inbox: { email, shared: false } }` when created, `200` when it already existed (idempotent; AgentMail `client_id` = Mind id). `409 email_skill_off`, `403 demo_not_allowed` (`action: "create_inbox"`), `403 mail_rejected` (`agentmailCode: "limit_exceeded"`: every AgentMail organization we have is full), `503 agentmail_not_configured \| agentmail_unreachable \| agentmail_error` **[tested; create live 9 Nov]** |
| `GET /v1/minds/{mindId}/mail/sent?limit=20` | | `{ sends: [{ sendId, status, to, subject, preview, messageId?, threadId?, code?, message?, at }] }`, newest first, refusals included (sent-mail list) **[tested]** |

### Mind wallet (#14, #15)

One OutLayer wallet per Mind, on testnet. The backend keeps the agent key and never returns it or the `handoff_url`. Owner actions are calls on `outlayer.testnet` that the **owner signs in the FE** with NEAR Connect (`signAndSendTransaction(transaction)`, signer = the signed-in account); the backend only builds them. After the owner signs, read `GET …/wallet` again for the new state.

| Route | Body | Answer |
|---|---|---|
| `POST /v1/minds/{mindId}/wallet` | `{}` | `201 { wallet }`; `409 wallet_exists` **[tested; live on testnet, 5 Nov]** |
| `GET /v1/minds/{mindId}/wallet` | | `{ wallet: { address, shared, balanceNear, spentTodayNear, frozen, policy: null \| { perTransactionNear, dailyNear, whitelist, transactionTypes, boundToThisWallet } } }`; `404 no_wallet`. `spentTodayNear` is OutLayer's own daily counter (`usage.daily.native.spent`), `"0"` before the first payment; the daily cap blocks a payment when `spentTodayNear + amount > dailyNear` (exactly reaching the cap goes through, a refused payment does not count; checked on testnet 10 Nov, #149). Whether the counter resets at 00:00 UTC or after a rolling 24 h is not proven yet. Inside `policy`, `perTransactionNear`, `dailyNear`, `whitelist` and `transactionTypes` are each `null` when the stored policy has no such rule (e.g. one set in the OutLayer dashboard); `whitelist` is also `null` when the address rule is not a whitelist. `address` is the wallet's implicit NEAR account: fund it from the owner's wallet before it can pay **[tested]** |
| `POST /v1/minds/{mindId}/wallet/policy` | `{ perTransactionNear: "0.05", dailyNear?: "0.3" \| null, whitelist: ["shop.testnet", …] }` | `{ transaction }` for `store_wallet_policy` (100 Tgas, deposit from the contract's `estimate_wallet_policy_cost`; args `wallet_pubkey`, `encrypted_data`, `wallet_signature`, `version`, `locked`, `valid_until`, the last three exactly as `sign-policy` returned them: `version` = stored version + 1, `valid_until` ≈ 7 days, after which the owner must ask for a new transaction). Builds policy v2: per-transaction limit (≤ 10 NEAR), optional daily cap (`rules.limits.daily.native`, ≤ 100 NEAR and not below the per-transaction limit; left out or `null` = none; over it OutLayer answers `403 policy_denied` "Daily limit exceeded…", no tx), whitelist (1–20 accounts), `transfer` only, OutLayer approval off (the app approves), bound to this wallet's key, approver = the owner **[tested; built live on testnet; owner signing not run yet]** |
| `POST /v1/minds/{mindId}/wallet/freeze`, `…/unfreeze` | `{}` | `{ transaction }` for `freeze_wallet` / `unfreeze_wallet` (30 Tgas, no deposit). A frozen wallet's transfers get `403 wallet_frozen` before signing **[tested]** |
| `GET /v1/minds/{mindId}/wallet/payments?limit=20` | | `{ payments }`, the same receipts the engine's `list_payments` reads (Receipts screen) **[tested]** |

`transaction` = `{ receiverId: "outlayer.testnet", actions: [{ type: "FunctionCall", params: { methodName, args, gas, deposit } }] }`. OutLayer down → `503 outlayer_unreachable` (`reason`); refusing → `503 outlayer_error` (`outlayerStatus`). Deleting a Mind deletes its wallet row: move the balance out first (a later route will do it).

### Chat, runs and the approval inbox

| Method and path | Body | Response |
|---|---|---|
| `POST /v1/minds/{mindId}/chat` | `{ message, threadId?, timeZone? }` | SSE of §3 events (plus `: ping` comments). Omit `threadId` for a new thread; `run.started.threadId` gives it. A `threadId` must belong to this Mind (`404 thread_not_found`). Engine `4xx` answers come back as JSON with the same status |
| `GET /v1/minds/{mindId}/runs?threadId&limit=20` | | `{ runs: [{ runId, threadId, workflowId, status, model, usage, costUsd, startedAt, finishedAt }] }` |
| `GET /v1/runs/{runId}` | | `{ run, events }` (all stored events, in `seq` order) |
| `GET /v1/minds/{mindId}/events?since=ISO&limit=2000` | | `{ events }` across runs since `since` (default 7 days), deltas left out: Mind Graph history mode (#17) |
| `GET /v1/minds/{mindId}/approvals` | | `{ approvals: [{ runId, threadId, toolCallId, tool, args, requestedAt }] }`: runs paused on `tool.approval_required` (#14) |
| `POST /v1/runs/{runId}/approve` · `/decline` | `{ toolCallId, reason?, timeZone? }` | SSE continuing the run's `seq`. `409 not_awaiting_approval` unless the run waits for that `toolCallId` |
| `POST /v1/runs/{runId}/cancel` | `{}` | Stop a run that is still streaming (#121; chat, approve/decline and builder runs). The backend aborts its engine request; the open SSE stream ends with `run.finished` `{ status: "canceled" }` (builder: `workflow.finished`); then `200 { run }` with `status: "canceled"` (or `finished` if it ended first). `409 { error: "not_running", status }` for a run that is not streaming: finished, errored, canceled, or `awaiting_approval` (a paused run has no stream: **decline** it instead). Only runs this backend process is relaying can be canceled; after a backend restart none are. Payments: a payment the engine already sent stays sent; whether the engine stops its model call on the abort is the engine's side (#121) **[tested: backend tests with the fake engine]** |
| `GET /v1/minds/{mindId}/threads?limit=20` | | Chat threads (#54), newest first: `{ threads: [{ threadId, title, lastMessageAt, messageCount }] }`. `title` is the newest `thread.titled` title of the thread (§3, #86), else the first user message; either is cut to ~60 characters (ending with `…`). `null` for a thread from before the backend kept user messages and without a `thread.titled` event; Mastra keeps no titles. Builder runs have no thread **[tested]** |
| `GET /v1/minds/{mindId}/threads/{threadId}/messages?limit=50&before=ISO` | | `{ messages: [{ id, role: "user" \| "assistant", text, createdAt, runId }], nextBefore }`, oldest first. One user message per chat run and one assistant message per run that wrote text (a run resumed after approval adds to its reply). Pages hold whole runs, newest first: pass `nextBefore` (an opaque cursor, `<ISO time>~<runId>`) as `before` for older ones (`null` = no more); a plain ISO time also works as `before`. `404 thread_not_found` for another Mind's or an unknown thread, `400 invalid_before` **[tested]**. No delete route yet: the engine's thread memory would stay behind |

The backend stores every event before forwarding it and reads the engine stream to the end even if the browser disconnects: reload and fetch `GET /v1/runs/{runId}` to recover.

### Secrets (#18)

| Method and path | Body | Response |
|---|---|---|
| `GET /v1/secrets` | | `{ secrets: [{ name, allowedHosts, createdAt, updatedAt }] }` (never values) |
| `PUT /v1/secrets/{NAME}` | `{ value, allowedHosts: ["api.example.com"] }` | `{ secret }` (summary). `NAME` is `UPPER_SNAKE_CASE`; hosts are lowercase host names without scheme, port or path; value ≥ 4 characters |
| `DELETE /v1/secrets/{NAME}` | | `204` or `404` |

All of the user's secrets are sent to the engine for every chat, approval and builder run (account level, v1). Autopilot runs get none (§6 q4).

### App connections through Composio (#13)

The owner connects an app (`gmail`, `googlecalendar` (#57) or `googlemeet` (#97, needed for Meet links)) once per account; Composio stores and refreshes the OAuth tokens. The Composio user id is the backend user id, the same `userId` the engine already gets on every run, so the engine opens a Composio session for that user and its Gmail tools act on that user's account only. Tokens never reach the backend, the browser or the model.

| Route | Body | Answer |
|---|---|---|
| `GET /v1/connections` | | `{ connections: [{ toolkit: "gmail" \| "googlecalendar" \| "googlemeet", status: "connected" \| "pending" \| "expired" \| "not_connected", since? }] }` (no Composio ids) **[tested]** |
| `POST /v1/connections/{toolkit}` | `{}` | `{ redirectUrl }`: a Composio Connect Link (`https://connect.composio.dev/…`). Open it in the browser; after sign-in Composio sends the owner to `{FE_ORIGIN}/connections?toolkit={toolkit}&status=success\|failed`, then the FE reads `GET /v1/connections` (the query string proves nothing). An unfinished attempt is replaced. `409 already_connected` **[tested; live against Composio, 5 Nov]** |
| `DELETE /v1/connections/{toolkit}` | | `204` (Composio deletes the connection and its tokens) or `404` **[tested]** |

Unknown toolkit → `404 unknown_toolkit`; Composio down → `503 composio_unreachable` (`reason`); refusing → `503 composio_error` (`composioStatus`); no `COMPOSIO_API_KEY` → `503 composio_not_configured`.

### Visual Builder and Autopilot (#20, #21)

Same paths and bodies as the engine (§2), under `/v1/minds/{mindId}/workflows…`, after the ownership check. The backend adds `userId`, the Mind config and secrets, so the browser sends only:

- `POST …/workflows/{workflowId}/runs`: `{ input?, timeZone? }` → SSE (stored like chat runs, `run.workflowId` set).
- `PUT …/workflows/{workflowId}/autopilot`: `{ input?, enabled? }` → engine answer as is (`200` or `409 cannot_autopilot`).

## 8. Mind registry contract (browser → NEAR, signed with Meteor)

`hellonear-registry.testnet` (`sc/`, interface in `sc/README.md`). The owner's wallet signs these calls; the Mind's OutLayer wallet and its spending limits are not involved.

- **`equip_skill(mind_id, skill_id)` pays the skill's publisher (#56, v0.3.0, on testnet since 7 Nov 2026).** Attach `price` (yoctoNEAR, from `get_skill(skill_id).price`) + 0.01 NEAR for storage; the excess comes back. Attach 30 Tgas. Both amounts are what the sandbox test attaches (`sc/tests/test_registry.rs`); it burnt 5.6 Tgas. Too little deposit fails with nothing stored and the deposit returned. Equipping again after an unequip pays again.
- Event `skill_equipped` (NEP-297 `hellonear_registry` **1.1.0**): `{ mind_id, skill_id, price, publisher }`, so the UI can show "paid X NEAR to Y". If the publisher's account no longer exists, the owner gets the price back and `skill_payment_refunded` `{ mind_id, skill_id, payer, price }` follows; the skill stays equipped.
