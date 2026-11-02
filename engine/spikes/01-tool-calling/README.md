# Spike 01: NEAR AI tool calling through Mastra (#5)

**Result: PASS** (2 Nov 2026, `@mastra/core` 1.81.0, Node 24.22.1).

## Run

```sh
npm install
npm run spike                                                    # tool calling, both models
node --env-file=../../.env --import tsx src/usage-check.ts      # usage + max_tokens checks
node --env-file=../../.env --import tsx src/usage-fix.ts        # streaming usage fix
```

Needs `NEARAI_API_KEY` in `engine/.env`. `results.json` holds the full output of `npm run spike`, including one sample per stream chunk type (input for `docs/api-contract.md`, #7).

## Findings

| Check | `z-ai/glm-5.3-flash` | `deepseek-ai/DeepSeek-V4.1-Flash-1017` |
|---|---|---|
| Prompt "17 + 25 and the time in UTC" | PASS: both tools called and executed, answer "42" | PASS: same |
| Tool args | `{"a":17,"b":25}`, `{}` | same |
| Latency (2 steps) | ~4.4 s | ~3.4 s |
| Reasoning chunks streamed | yes (`reasoning-start/delta/end`) | no reasoning chunks, though usage reports reasoning tokens |
| Tokens per turn with 1 tool (streaming fix) | 441 in / 28 out | 778 in / 89 out |

1. **Tool calling works** for both Confidential TEE models through the built-in `nearai/...` provider. Both models called the two tools in parallel in one step.
2. **`toolName` in stream chunks is the key in the agent's `tools` object** (e.g. `addNumbers`), not the tool's `id` (`add_numbers`). Map Mind Graph nodes by that key, or use the same string for both.
3. **Token usage is missing when streaming with the `nearai/...` router string.** `generate()` reports full usage, but `stream()` returns empty usage, because NEAR AI only sends usage in a stream when the request has `stream_options.include_usage` (checked with curl). **Fix (tested):** build the model with `@ai-sdk/openai-compatible` and `includeUsage: true`:
   ```ts
   import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
   const nearai = createOpenAICompatible({ name: 'nearai', baseURL: 'https://cloud-api.near.ai/v1', apiKey: process.env.NEARAI_API_KEY, includeUsage: true })
   new Agent({ ..., model: nearai.chatModel('z-ai/glm-5.3-flash') })
   ```
   Tool calling still passes and streaming usage is filled in. We need it for per-step cost in the Mind Graph.
4. **`max_tokens`:** with a short question, `maxOutputTokens: 20` was enough (reasoning used ~15–90 chars). The earlier 5-token test returned empty `content` because reasoning used it all. Use a generous default (e.g. 1024–2048) for agent turns.
5. Chunk types seen in a tool-calling turn: `start`, `step-start`, `reasoning-*` (glm only), `tool-call-input-streaming-start`, `tool-call-delta`, `tool-call-input-streaming-end`, `tool-call`, `tool-result`, `step-finish`, `text-start`, `text-delta`, `text-end`, `finish`.

## Not covered

- Long multi-step tasks, tool errors, and approval flows (covered by later issues).
- TEE verification of responses (#19).
- Load testing: not run; this spike only proves feasibility.
