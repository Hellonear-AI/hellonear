# CLAUDE.md — engine/

AI engine: a Mastra server that runs each Mind (soul, skills, tools, memory, schedules) on NEAR AI Cloud models. Owner: Axel. Issues: #5, #11, #13–#21.

**Update this file in the same PR whenever you change setup, commands, env vars, the Mastra version, model choices, or engine conventions.** Root rules in `/CLAUDE.md` also apply.

## Stack

- `@mastra/core` **1.81.0, pinned.** Do not upgrade during the hackathon (dynamic workflows are Beta and the API moves fast).
- Models: NEAR AI Cloud (`NEARAI_API_KEY`). Default `z-ai/glm-5.3-flash`, reasoning `deepseek-ai/DeepSeek-V4.1-Flash-1017`, embeddings `Qwen/Qwen3-Embedding-0.6B`. Tool calling through Mastra is proven for both chat models (spike `spikes/01-tool-calling`, #5). Never fall back to a model without `tools` in `supportedFeatures` (e.g. GPT-6 Luna).
- **Build streaming chat models with `@ai-sdk/openai-compatible` and `includeUsage: true`** (`nearai.chatModel('<id>')`), not the `nearai/<id>` router string: the router string streams with empty token usage, and we need usage for per-step cost. See the spike README.
- Storage and memory: Postgres + pgvector.

## Conventions

- One generic Mind agent; per-Mind config comes from `RequestContext` (`@mastra/core/request-context`), not from separate agent definitions.
- Skills: parse `SKILL.md` frontmatter yourself, then call `createSkill({ name, description, instructions, ... })`. Restrict tools in the `tools` resolver (Mastra does not enforce `allowed-tools`).
- Multi-agent: supervisor/subagents. Do not use `.network()` (deprecated).
- Autopilot: use **workflow** schedules with `requestContext`; agent schedules do not accept it.
- Reasoning models spend part of `max_tokens` on reasoning; keep limits generous (a 5-token test returned empty `content`).
- E2EE only works on `/chat/completions`, not the Responses API.
- Secrets: never put secret values in prompts. Inject them at tool execution via `RequestContext`, check `allowedHosts`, and redact by **value** in streams and traces (`SensitiveDataFilter` only matches field names).
- Wallet tools: require approval (`requireApproval`); never expose owner actions (policy changes, freeze) as LLM tools.
- Emit stream events in the shape agreed in `docs/api-contract.md` (#7); the Mind Graph depends on them.
- In stream chunks, `payload.toolName` is the **key** in the agent's `tools` object, not the tool's `id`. Use the same string for both to avoid mismatches.
- Spikes live in `spikes/<nn>-<name>/` with a README stating the result, how to run it, and what it does not cover.

## Skill feedback

The `mastra` skill can report bugs and doc defects to the Mastra team. Never let a report include code from this repo, secrets, or user data; decline if unsure.

## Commands

- `npm run dev` (port 4100), `npm test` (integration, real NEAR AI + local Postgres), `npm run typecheck`.
- Postgres: `docker compose up -d postgres` from the repo root; `docker compose stop` when done.
- Load test: `k6 run -e BASE=http://localhost:4100 -e KEY=$ENGINE_API_KEY load/chat.js` (keep it small; it spends NEAR AI credit).
- Run `npm test` and the load test before every push/merge that touches the engine, and report results in the PR.

## Testing notes

- LLM output varies. Assert on what the engine guarantees (events, seq, tool execution, approval gating), not on exact wording, and only on the tool under test (after a decline the model may call other tools).
- Tools needing approval require Mastra storage (snapshots); tests use the local Postgres.
- Changing a Mind's persona mid-thread: the instructions do change per request, but the model tends to copy its own earlier replies in that thread (verified 3 Nov). Start a new thread after a persona change, and test persona switches on a new thread.

## Env

See `.env.example` (`NEARAI_API_KEY`, `DATABASE_URL`, `ENGINE_API_KEY`, optional `PORT`). `.env` is gitignored; never commit it.
