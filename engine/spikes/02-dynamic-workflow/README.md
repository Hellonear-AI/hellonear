# Spike 02: Mastra dynamic workflows for the Visual Builder (#20)

**Question:** can a workflow saved as JSON at runtime (`mastra.addDynamicWorkflow`, Beta, `@mastra/core` 1.81.0) drive our generic Mind agent and our tools, with the Mind's persona and the owner's secrets coming from `RequestContext`?

**Answer: yes, with one safety gap the engine must close itself.** Run on 3 Nov 2026 against real NEAR AI (`z-ai/glm-5.3-flash`) and local Postgres (schema `spike`).

| Check | Result |
|---|---|
| `mapping → tool(get_time) → mapping → agent(mind) → mapping → tool(http_request)` registers and runs | `success` |
| Agent step uses the persona from `RequestContext` (`run.stream({ requestContext })`) | reply signed "— Rex" |
| `http_request` step gets the secrets from `RequestContext` | secret sent to httpbin, echoed back redacted (`••••`), raw value absent |
| `conditional` with `gt` / `not` predicates | `n=3` ran `small`, `n=30` ran `big` |
| Unknown `toolId` | rejected before storage: `[missing-reference] graph.0.toolId` |
| String mapped into `add_numbers` (expects numbers) | rejected: `[incompatible-schema] graph.1` |
| Definitions persisted (`@mastra/pg` `workflowDefinitions` domain) | rows in `spike.mastra_workflow_definitions` |
| A fresh `Mastra` instance sees stored workflows | **only after `mastra.startWorkers()`** (it calls the private `#loadDynamicWorkflows`); without it, `getWorkflow` throws "not found" |
| Agent chunks inside an agent step | arrive as `workflow-step-output` with `payload.output` = the normal agent chunk (`tool-call`, `text-delta`, `step-finish` with `metadata.id`, …), so the chat normalizer and the badge can be reused |
| **Tool with `requireApproval` (`demo_transfer`) as a workflow tool step** | **executed without any approval** (`status: success`, output returned) |

## Consequences for the engine

- Never let a workflow call a tool with `requireApproval` directly; the builder compiler rejects them.
- Agent steps in a workflow run unattended, so they must not see approval tools either (nobody can approve).
- Register tools on the `Mastra` instance (`tools`), and call `startWorkers()` at boot so saved workflows survive restarts.
- Keep user text away from Mastra `${...}` templates: they can read `requestContext`, which holds the secrets.

## Run

```sh
docker compose up -d postgres   # repo root
cd engine
node --env-file=.env --import tsx spikes/02-dynamic-workflow/spike.ts   # main checks
node --env-file=.env --import tsx spikes/02-dynamic-workflow/peek.ts    # chunk shapes of an agent step
```

Spends a few NEAR AI calls. Writes to schema `spike` only.

## Not covered

Schedules (#21), suspend/resume inside workflows, `foreach`/`loop`, nested workflows.
