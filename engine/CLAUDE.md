# CLAUDE.md — engine/

AI engine: a Mastra server that runs each Mind (soul, skills, tools, memory, schedules) on NEAR AI Cloud models. Owner: Axel. Issues: #5, #11, #13–#21.

**Update this file in the same PR whenever you change setup, commands, env vars, the Mastra version, model choices, or engine conventions.** Root rules in `/CLAUDE.md` also apply.

## Stack

- `@mastra/core` **1.81.0, pinned.** Do not upgrade during the hackathon (dynamic workflows are Beta and the API moves fast).
- Models via the built-in `nearai` provider (`NEARAI_API_KEY`): default `nearai/z-ai/glm-5.3-flash`, reasoning `nearai/deepseek-ai/DeepSeek-V4.1-Flash-1017`, embeddings `nearai/Qwen/Qwen3-Embedding-0.6B`. Never fall back to a model without `tools` in `supportedFeatures` (e.g. GPT-6 Luna).
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

## Env

See `.env.example`. `.env` is gitignored; never commit it.
