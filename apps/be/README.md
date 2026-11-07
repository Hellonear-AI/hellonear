# apps/be

HelloNear backend API: NEP-413 login, Minds, chat relay with event storage (Mind Graph, approval inbox), encrypted secrets, Visual Builder and Autopilot proxy. The browser only talks to this server; it calls the engine with `X-Engine-Key`. Contract: `docs/api-contract.md` (§7 is the browser-facing API).

**Owner:** James · Issues: #8 (scaffold), #6 (OutLayer spike), #13–#18. Plan and decisions: #3, #4.

## Run locally

```sh
docker compose up -d postgres      # from the repo root; Postgres + pgvector, capped at 1 CPU / 512 MB
cd apps/be
cp .env.example .env               # set ENGINE_API_KEY (same as the engine's) and SECRETS_MASTER_KEY
bun install                        # Bun is the package manager; the runtime is Node ≥ 24.22.1
bun run dev                        # http://localhost:4000/v1/health (applies migrations at start)
bun run test:unit                  # offline: encryption, SSE parsing
bun run test                       # unit + integration: local Postgres + a fake engine (no NEAR AI credit, ~3 s)
bun run load                       # 10 users × 10 s of chat + list against the fake engine; fails if any event is lost
bun run typecheck
docker compose stop                # when done
```

A real wallet login against testnet: put a testnet account and one of its full-access keys in `.env` (`NEAR_TEST_ACCOUNT_ID`, `NEAR_TEST_PRIVATE_KEY`), start `bun run dev`, then `node --env-file=.env --import tsx scripts/login-smoke.ts`.

## Layout

- `src/server.ts`: routes (§7 of the contract); every Mind/run route checks ownership first.
- `src/auth.ts`: challenge → NEP-413 `verifyMessage` (full-access key checked on the RPC) → session cookie `hn_session` (only its SHA-256 is stored).
- `src/minds.ts`: Minds from engine templates; the Mind config sent to the engine on every run.
- `src/runs.ts`: relays engine SSE to the browser and stores every event in `run_events`; run summaries, Mind Graph history, approval inbox.
- `src/secrets.ts` + `src/crypto.ts`: AES-256-GCM secrets bound to user and name; decrypted only for an engine call.
- `src/workflows.ts`: Builder/Autopilot proxy; resends the Mind config to every Autopilot schedule when the Mind changes.
- `migrations/*.sql`: schema, applied in order at start (`bun run migrate` to apply only).
- `test/fake-engine.ts`: canned engine for tests and the load test.
