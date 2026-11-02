# CLAUDE.md — apps/fe

Web app (Next.js App Router + NEAR Connect). Owner: Ancung. Design comes from Nabil (#10). Issues: #9, #13–#21.

**Update this file in the same PR whenever you change setup, commands, env vars, dependencies, routes, or FE conventions.** Root rules in `/CLAUDE.md` also apply.

## Stack

- Scaffold with `npx create-near-app@latest fe --frontend next-app --install` in a temporary folder, then move the files here (create-near-app refuses non-empty folders). The `near-dapp` agent skill still mentions removed options (`--contract ts`, `next-page`); follow the create-near-app README.
- Wallet: `@hot-labs/near-connect` 0.12.0 + `near-connect-hooks` 1.1.6, testnet.
- Mind Graph: `react-force-graph-2d` (1.29.2). Visual Builder (bonus): `@xyflow/react` 12.x.

## Conventions

- Never hold or send the backend's API keys or grant tokens in the browser; the FE only talks to `apps/be`.
- Wording: say "policy stored on-chain, enforced in a TEE". A rejected transfer shows `policy_denied` and the rule, never a tx link.
- "Verified private" badge only for replies the backend marks as verified (Confidential TEE models).
- Redacted secrets render as `••••`; never try to unredact.
- Use the event shapes in `docs/api-contract.md` (#7); do not invent fields.
