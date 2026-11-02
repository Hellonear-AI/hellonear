# CLAUDE.md — apps/be

Backend API: Postgres + pgvector, NEP-413 login, run/event storage + SSE, encrypted secret store, OutLayer and Composio integration. Owner: James. Issues: #6, #7, #8, #13–#18.

**Update this file in the same PR whenever you change setup, commands, env vars, the DB schema, endpoints, or BE conventions.** Root rules in `/CLAUDE.md` also apply.

## Stack

- `near-api-js` 7.4.0 (Node ≥22.22.2). Auth: `near-api-js/nep413` `verifyMessage` (main), `near-sign-verify` (alternative).
- OutLayer on **testnet** (`https://testnet-api.outlayer.ai`). Intents routes (`/intents/*`, swaps, limit orders) are mainnet-only and out of scope.
- Composio via `@composio/mastra`; always use a per-user Session (calls outside a Session are capped at 10K/month).

## Conventions

- Store OutLayer `wk_...` keys and Composio/OAuth tokens encrypted; never log them, never return them to the FE, never pass them into prompts.
- Per-skill wallet = an OutLayer **sub-wallet** (`PUT /wallet/v1/api-key` creates a new wallet with its own address and balance). Fund it from a whitelisted parent; move the balance back before revoking.
- Owner actions (policy changes, `freeze_wallet()`) are signed by the owner's NEAR account (the team uses Meteor Wallet on testnet), not by the backend. Whether the OutLayer dashboard accepts Meteor is checked in #6; record the result here.
- Use per-transaction limits, whitelist, multisig, or freeze for hard stops; cumulative (daily) limits can be exceeded under parallel requests.
- Every route checks that the user owns the Mind/agent it touches.
- Schema and events follow `docs/api-contract.md` (#7).
