# CLAUDE.md — apps/be

Backend API: Postgres + pgvector, NEP-413 login, run/event storage + SSE, encrypted secret store, OutLayer and Composio integration. Owner: James. Issues: #6, #7, #8, #13–#18.

**Update this file in the same PR whenever you change setup, commands, env vars, the DB schema, endpoints, or BE conventions.** Root rules in `/CLAUDE.md` also apply.

## Stack

- Plain `node:http` + `zod` + `pg`, like the engine; tests with `node:test`. Runtime **Node ≥ 24.22.1**, package manager **Bun** (`bun.lock`). Versions pinned in `package.json`; do not upgrade during the hackathon.
- `near-api-js` 7.4.0. Auth: `near-api-js/nep413` `verifyMessage` (main), `near-sign-verify` (alternative).
- OutLayer on **testnet** (`https://testnet-api.outlayer.ai`). Intents routes (`/intents/*`, swaps, limit orders) are mainnet-only and out of scope.
- Composio via `@composio/mastra`; always use a per-user Session (calls outside a Session are capped at 10K/month).

## Conventions

- Store OutLayer `wk_...` keys and Composio/OAuth tokens encrypted; never log them, never return them to the FE, never pass them into prompts.
- Per-skill wallet = an OutLayer **sub-wallet** (`PUT /wallet/v1/api-key` creates a new wallet with its own address and balance). Fund it from a whitelisted parent; move the balance back before revoking.
- Owner actions (policy changes, `freeze_wallet()`) are signed by the owner's NEAR account (the team uses Meteor Wallet on testnet), not by the backend. **Meteor works with the OutLayer dashboard** (#6, 4 Nov): it connected and signed the policy, an approval and the freeze. The dashboard defaults to mainnet; it reads `localStorage["near-wallet-selector:selectedNetworkId"]`, so pick testnet first or a testnet key shows "Invalid or revoked API key".
- OutLayer answers (spike `spikes/01-outlayer/`): over the per-transaction limit or off the whitelist → `403 policy_denied`; frozen → `403 wallet_frozen`; both happen before signing, so there is no tx. When the owner's policy has an approval threshold (`approval.threshold.required`), a transfer under the limit comes back `200 { status: "pending_approval", approval_id }`: poll `GET /wallet/v1/requests/{id}` until `success` (with `tx_hash`) or `failed`.
- The `handoff_url` carries the wallet's `wk_` key in its query string; do not send it to the FE until #15 decides how owners open the dashboard.
- Use per-transaction limits, whitelist, multisig, or freeze for hard stops; cumulative (daily) limits can be exceeded under parallel requests.
- Every route checks that the user owns the Mind/agent it touches (`requireMind`, `getRun`). Another user's Mind answers `404`, never `403`.
- Login: one-time nonce consumed atomically before the signature check; `verifyMessage` also rejects function-call keys. Sessions: only `sha256(token)` is stored; cookie `hn_session`, `HttpOnly`, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`. State-changing requests with an `Origin` other than `FE_ORIGIN` get `403` (CSRF).
- **Thread ids are issued by the backend** (`thr_…`). A `threadId` from the browser is only accepted if a run of that same Mind already used it: engine memory is keyed by thread, so a foreign id would read another Mind's history.
- The chat relay (`src/runs.ts`) reads the engine stream to the end even when the browser leaves, so `run_events` is complete. Store every event before forwarding it; deltas are batched. A resumed run continues the paused run's `seq`; if the engine restarted (its counter is in memory) the backend shifts the new events after the stored ones.
- Secrets: AES-256-GCM with `SECRETS_MASTER_KEY`, AAD `userId:name`. Never return values, never log them, decrypt only in `secretsForRun` for one engine call. Host rules match the engine's (`allowedHosts`, lowercase host names, no scheme/port/path).
- Approve/decline only for a run in `awaiting_approval` whose `tool.approval_required` event has that `toolCallId` (`409` otherwise).
- Deleting a Mind deletes its engine workflows first (which removes their Autopilot schedules).
- Schema and events follow `docs/api-contract.md` (#7).
- Builder workflows (#20) are stored by the engine; the backend proxies `…/workflows` calls after the ownership check and sends the Mind config and secrets on each run, as for chat.
- Autopilot (#21): `PUT …/workflows/{id}/autopilot` stores a copy of the Mind config in the engine. **Send it again for every Autopilot workflow of a Mind whenever that Mind changes** (persona, model, skills); a `409` means the engine paused it, show `pausedFor`. Scheduled runs get no secrets yet (`docs/api-contract.md` §6 q4).

## Commands

- `bun run dev` (port 4000, applies migrations at start), `bun run migrate`, `bun run test:unit` (offline), `bun run test` (unit + integration: local Postgres + fake engine), `bun run load` (fake engine; fails if a run loses events), `bun run typecheck`.
- Postgres: `docker compose up -d postgres` from the repo root; `docker compose stop` when done.
- Schema changes: add a new `migrations/NNN_name.sql` (never edit an applied one) and update `docs/api-contract.md` §5.
- Tests never call NEAR AI or the NEAR RPC: `test/fake-engine.ts` stands in for the engine and `setProvider()` fakes the access-key lookup; signatures are real. Run `bun run test` and `bun run load` before every push/merge that touches `apps/be`, and report results in the PR. CI: `.github/workflows/be.yml`.
- End-to-end checks against the real engine need `NEARAI_API_KEY` in `engine/.env`; a real wallet login needs `NEAR_TEST_ACCOUNT_ID` / `NEAR_TEST_PRIVATE_KEY` (`scripts/login-smoke.ts`).

## Env

See `.env.example`: `DATABASE_URL`, `ENGINE_URL`, `ENGINE_API_KEY`, `SECRETS_MASTER_KEY` (32 bytes base64; losing it loses every stored secret), optional `PORT`, `FE_ORIGIN`, `AUTH_RECIPIENT`, `NEAR_RPC_URL`, `COOKIE_SECURE`. `.env` is gitignored; never commit it.
