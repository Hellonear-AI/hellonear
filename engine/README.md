# engine

HelloNear AI engine: a Mastra server that runs each Mind (soul, skills, memory, tools, scheduler) on NEAR AI Cloud models.

**Owner:** Axel · Issues: #5 (tool-calling spike), #11 (skeleton) · Context: `research.md` 7.1, 8.2, 9.2.

## Setup

1. `cp .env.example .env` and set `NEARAI_API_KEY` (from https://cloud.near.ai or the NEAR Builders credit).
2. Planned stack: `@mastra/core` 1.81.0 (pinned), built-in `nearai` provider (e.g. `model: 'nearai/z-ai/glm-5.3-flash'`), Postgres + pgvector.

Note: NEAR AI reasoning models spend part of `max_tokens` on reasoning, so keep the limit generous.
