# engine

HelloNear AI engine: an HTTP service (Mastra 1.81.0) that runs each Mind on NEAR AI Cloud models and streams normalized events to the backend. Contract: `docs/api-contract.md`.

**Owner:** Axel · Issues: #5 (spike, done), #11 (this skeleton), #13–#21.

## Run locally

```sh
docker compose up -d postgres      # from the repo root; Postgres + pgvector, capped at 1 CPU / 512 MB
cd engine
cp .env.example .env               # set NEARAI_API_KEY and ENGINE_API_KEY
npm install
npm run dev                        # http://localhost:4100/v1/health
npm run test:unit                  # offline unit tests (skills, templates, graph)
npm test                           # unit + integration tests (real NEAR AI + local Postgres, ~2-3 min)
npm run typecheck
docker compose stop                # when done, to keep the laptop cool
```

Load test (small, real NEAR AI calls): `k6 run -e BASE=http://localhost:4100 -e KEY=$ENGINE_API_KEY load/chat.js`.

## What is in the skeleton

- `src/server.ts`: `POST /v1/minds/{mindId}/chat`, `POST /v1/runs/{runId}/approve|decline`, `GET /v1/health`; `X-Engine-Key` auth.
- `src/mastra.ts`: one generic Mind agent; persona, model and tools come from `RequestContext`; Postgres storage (schema `mastra`) and pgvector; memory with history, semantic recall and working memory scoped to `userId:mindId`.
- `src/events.ts`: Mastra chunks → HelloNear events (`run.started`, `tool.called`, `tool.result`, `tool.approval_required`, `run.finished` with usage and cost, …).
- `src/tools.ts`: tool registry (`get_time`, `add_numbers`, `demo_transfer` which needs approval and moves no money).
- `skills/<name>/SKILL.md` + `src/skills.ts`: skill catalog (daily-planner available, payments simulated until OutLayer #6, email-triage blocked until Composio).
- `templates/*.json` + `src/templates.ts`: General Assistant, Payments Mind, Email Manager; served at `GET /v1/templates`.
- `src/graph.ts`: Mind Graph node ids.
- `src/models.ts`: NEAR AI chat/embedding models via `@ai-sdk/openai-compatible` with `includeUsage`.
