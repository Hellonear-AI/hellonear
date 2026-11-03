# engine

HelloNear AI engine: an HTTP service (Mastra 1.81.0) that runs each Mind on NEAR AI Cloud models and streams normalized events to the backend. Contract: `docs/api-contract.md`.

**Owner:** Axel · Issues: #5 (spike, done), #11 (this skeleton), #13–#21.

## Run locally

```sh
docker compose up -d postgres      # from the repo root; Postgres + pgvector, capped at 1 CPU / 512 MB
cd engine
cp .env.example .env               # set NEARAI_API_KEY and ENGINE_API_KEY
bun install                        # Bun is the package manager; the runtime stays Node ≥ 24.22.1
bun run dev                        # http://localhost:4100/v1/health
bun run test:unit                  # offline unit tests (skills, templates, graph, secrets, verify, tools, builder)
bun run test                       # unit + integration tests (real NEAR AI, local Postgres, testnet RPC, httpbin; ~6 min)
bun run typecheck
docker compose stop                # when done, to keep the laptop cool
```

Load tests (keep them small):
- `k6 run -e BASE=http://localhost:4100 -e KEY=$ENGINE_API_KEY load/chat.js` (real NEAR AI calls).
- `k6 run -e BASE=http://localhost:4100 -e KEY=$ENGINE_API_KEY load/workflow.js` (builder runs + concurrent re-saves, local tools only, no credit). Add `-e AGENT=1 -e VUS=2 -e DURATION=20s` to include an agent step (real NEAR AI calls).

## What is in the skeleton

- `src/server.ts`: `POST /v1/minds/{mindId}/chat`, `POST /v1/runs/{runId}/approve|decline`, `GET /v1/health`; `X-Engine-Key` auth.
- `src/mastra.ts`: one generic Mind agent; persona, model and tools come from `RequestContext`; Postgres storage (schema `mastra`) and pgvector; memory with history, semantic recall and working memory scoped to `userId:mindId`.
- `src/events.ts`: Mastra chunks → HelloNear events (`run.started`, `tool.called`, `tool.result`, `tool.approval_required`, `run.finished` with usage and cost, …).
- `src/tools.ts`: tool registry (`get_time`, `add_numbers`, `demo_transfer` which needs approval and moves no money, `http_request`, `near_view_account` which reads a testnet balance).
- `src/builder.ts` + `src/workflows.ts`: Visual Builder (#20). A canvas (trigger → agent/tool/http nodes → optional condition) compiles into a Mastra dynamic workflow, saved in Postgres and runnable at `POST /v1/minds/{mindId}/workflows/{workflowId}/runs`. Findings behind it: `spikes/02-dynamic-workflow/`.
- `src/autopilot.ts`: Autopilot (#21). Runs a saved workflow on its trigger's cron through Mastra workflow schedules, with a stored copy of the Mind config; run history at `GET …/workflows/{workflowId}/runs`. Findings: `spikes/03-autopilot/`.
- `skills/<name>/SKILL.md` + `src/skills.ts`: skill catalog (daily-planner available, payments simulated until OutLayer #6, email-triage blocked until Composio).
- `templates/*.json` + `src/templates.ts`: General Assistant, Payments Mind, Email Manager; served at `GET /v1/templates`.
- `src/graph.ts`: Mind Graph node ids.
- `src/secrets.ts` + `http_request` tool + `skills/http-request`: Connections & Secrets (#18): placeholders, host allowlist, SSRF guard, redaction.
- `src/models.ts`: NEAR AI chat/embedding models via `@ai-sdk/openai-compatible` with `includeUsage`.
