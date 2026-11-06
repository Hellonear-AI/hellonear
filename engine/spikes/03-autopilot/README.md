# Spike 03: Autopilot with Mastra workflow schedules (#21)

**Question:** can `mastra.schedules` fire our Visual Builder workflows (Mastra dynamic workflows, Beta) on a cron, with the Mind config in the schedule's `requestContext`, and can we show a run history?

**Answer: yes.** Measured on 4 Nov 2026 with `@mastra/core` 1.81.0 and `@mastra/pg` 1.34.0 (local Postgres, schema `spike`, real NEAR AI model).

## Results

| Probe | Result |
|---|---|
| `schedules.create({ workflowId, cron: '*/20 * * * * *', requestContext, resourceId })` on a dynamic workflow, then `startWorkers()` | Fired at :00, :20, :40 (about 0–60 ms late). All runs `success`. |
| Mind config in the schedule's `requestContext` reaches the agent step | Yes: every reply ended with the persona's sign-off ("— Penny"). |
| `unattended: true` in the stored `requestContext` | Yes: the Payments Mind listed `get_time`, `skill`, `skill_search` and `skill_read`; `demo_transfer` was hidden. |
| `schedules.run(id)` (fire now) | Works; trigger `triggerKind: "manual"`, run id `sched_<scheduleId>_<ts>`. |
| Trigger history (`storage.getStore('schedules').listTriggers`) | One row per fire: `runId`, `scheduledFireAt`, `actualFireAt`, `outcome: "published"`. The outcome is write-once at dispatch; the run status comes from the run snapshot. |
| `resourceId` on the schedule | Runs are stored with it: `listWorkflowRuns({ resourceId })` returned all 4. |
| `pause(id)` | `status: "paused"`; no more fires. |
| Retention (`retention: { workflows: { workflowSnapshot }, schedules: { triggers } }` + `storage.prune()`) | Deleted 24 snapshots and 4 triggers older than `maxAge`. |
| Stored `requestContext` | Kept verbatim as JSON in `mastra_schedules` (and copied into each run snapshot). |

## Consequences for the engine

- **Never put secrets in a schedule's `requestContext`**: it is stored as plain JSON. (Interactive runs keep secrets in a `Map`, which serializes to `{}` in snapshots; checked in the DB on 4 Nov.) Until the backend can hand secrets to unattended runs, Autopilot refuses workflows that use `{{secrets.…}}`.
- The Mind config is a copy taken when Autopilot is turned on, so the backend must send it again when the Mind changes.
- Delivery is best-effort (Mastra docs): a fire can be skipped and is not replayed. The history must show what really ran, from run snapshots, not from triggers alone.
- Retention is opt-in and must be run by us (`storage.prune()`); Mastra never runs it.

## Run

```sh
docker compose up -d postgres   # repo root
cd engine && node --env-file=.env --import tsx spikes/03-autopilot/spike.ts
```

Takes about 80 s and calls the model 4 times.

## Not covered

- Sub-minute crons in production (the builder only accepts 5-field crons, so at most once a minute).
- Several engine processes sharing one schedules table (Mastra claims each fire with a CAS update; not tested here).
- Approvals inside scheduled runs (blocked: approval tools are refused in workflows; real payments need OutLayer, #6).
