# CLAUDE.md — apps/fe

Web app (Next.js App Router + NEAR Connect). Owner: Ancung. Design comes from Nabil (#10). Issues: #9, #13–#21.

**Update this file in the same PR whenever you change setup, commands, env vars, dependencies, routes, or FE conventions.** Root rules in `/CLAUDE.md` also apply.

## Stack

- Scaffold with `npx create-near-app@latest fe --frontend next-app --install` in a temporary folder, then move the files here (create-near-app refuses non-empty folders). The `near-dapp` agent skill still mentions removed options (`--contract ts`, `next-page`); follow the create-near-app README. Then delete the generated `package-lock.json` and run `bun install` (the repo uses Bun, see the root `CLAUDE.md`).
- Wallet: `@hot-labs/near-connect` 0.12.0 + `near-connect-hooks` 1.1.6, testnet. **Meteor Wallet is the primary wallet:** show it first and test every flow with it. Per the official manifest (`hot-dao/near-selector`, checked 2 Nov) it supports `signMessage`, `signAndSendTransaction(s)`, `signDelegateActions`, and testnet. Keep other wallets selectable for judges.
- Mind Graph: `react-force-graph-2d` (1.29.2). Visual Builder (bonus): `@xyflow/react` 12.x.
- Scaffolded with `create-near-app` 10.0.0 (`--frontend next-app`). All versions in `package.json` are pinned exactly; do not upgrade during the hackathon.
- Still from the template, to replace in #9: Bootstrap styling, the `hello-near` demo route, `function-call-key-plugin`, and the template's own `src/providers/NearProvider.tsx` on `@hot-labs/near-connect` 0.11.4 (the target is 0.12.0 + `near-connect-hooks` 1.1.6).

## Commands

```sh
bun install
bun run dev        # http://localhost:3000
bun run typecheck
bun run lint
bun run build
```

## Structure

```
app/                     routes only; each page renders one screen from src/modules
src/
  components/
    ui/                  low-level primitives
    elements/            shared building blocks (cards, badges, amounts...)
    layout/              app shell and navigation
  modules/<feature>/     components/ (screens + parts), hooks/, data/ (dummy data first)
                         minds (Choose a Mind), chat, bazaar, wallet (Wallet & Policy), graph (Live view / Mind Graph)
  hooks/                 hooks shared across modules
  lib/                   config (network, contract ids), api clients, formatting
  providers/             AppProviders + NearProvider (wallet context)
  styles/                globals.css and CSS modules
  types/                 shared types
tests/                   unit tests
```

Imports: `@/*` → `src/*`, `@app/*` → `app/*`. Keep route files in `app/` thin; put screens in `src/modules/<feature>/components`.

## Conventions

- Never hold or send the backend's API keys or grant tokens in the browser; the FE only talks to `apps/be`.
- Wording: say "policy stored on-chain, enforced in a TEE". A rejected transfer shows `policy_denied` and the rule, never a tx link.
- "Verified private" badge only for replies the backend marks as verified (Confidential TEE models).
- Redacted secrets render as `••••`; never try to unredact.
- Use the event shapes in `docs/api-contract.md` (#7); do not invent fields.
- Visual Builder (#20): save the React Flow `{ nodes, edges }` in the canvas format of `docs/api-contract.md` §2 "Visual Builder workflows" (node types `trigger`, `agent`, `tool`, `http`, `condition`; condition edges use `sourceHandle: "then" | "else"`). Show the engine's `issues` on a 400. Light nodes up from `node.started` / `node.finished` (`node` = your canvas node id).
