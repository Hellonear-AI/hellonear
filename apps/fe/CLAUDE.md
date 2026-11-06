# CLAUDE.md — apps/fe

Web app (Next.js App Router + NEAR Connect). Owner: Ancung. Design comes from Nabil (#10). Issues: #9, #13–#21.

**Update this file in the same PR whenever you change setup, commands, env vars, dependencies, routes, or FE conventions.** Root rules in `/CLAUDE.md` also apply.

## Stack

- Scaffold with `npx create-near-app@latest fe --frontend next-app --install` in a temporary folder, then move the files here (create-near-app refuses non-empty folders). The `near-dapp` agent skill still mentions removed options (`--contract ts`, `next-page`); follow the create-near-app README. Then delete the generated `package-lock.json` and run `bun install` (the repo uses Bun, see the root `CLAUDE.md`).
- Wallet: `@hot-labs/near-connect` 0.12.0 + `near-connect-hooks` 1.1.6, testnet. **Meteor Wallet is the primary wallet:** show it first and test every flow with it. Per the official manifest (`hot-dao/near-selector`, checked 2 Nov) it supports `signMessage`, `signAndSendTransaction(s)`, `signDelegateActions`, and testnet. Keep other wallets selectable for judges.
- Live view (Mind Graph): our own SVG with a `viewBox`, a fixed map like the design (Mind in the center, its nodes around it), not `react-force-graph-2d` (decided 6 Nov: lighter, responsive, and the lines can animate per the motion rules). Visual Builder (bonus): `@xyflow/react` 12.12.1.
- Data and state: `@tanstack/react-query` 5.106.1 for all server data (cache, polling, refresh after approve or freeze). **No global state library.** The current Mind's id lives in the URL (`/minds/[mindId]/…`), every screen reads the Mind through the same React Query hook (one fetch, shared cache), and the last used Mind is kept in `localStorage`. One React context holds the chat run in progress so the chat, the live view and the Approvals badge read the same events. Add `zustand` only if that context gets heavy.
- Streams: chat, approve/decline and builder runs are POST + SSE, so `EventSource` can't be used; read the `fetch` body with `eventsource-parser` 4.1.3.
- Forms: `react-hook-form` 7.91.0 + `zod` 4.6.7 + `@hookform/resolvers` 7.0.3 (validate as you type, as in the design).
- Toasts: `sonner` 2.0.8 (shadcn's). Theme: `next-themes` 0.4.6 (System, Light, Dark from the account menu). Mind replies: `react-markdown` 10.1.0. Springs (Penny is ready, freeze, Builder drag): `motion` 14.10.0; everything else is CSS.
- Tests: `vitest` 5.1.0 (unit), `@playwright/test` 1.65.0 (flows).
- Motion: easing tokens are in `src/styles/globals.css` (`ease-out`, `ease-in-out`, `ease-drawer` utilities; Tailwind only emits them once used). Rules, durations and chat streaming: `design/CLAUDE.md` "Motion (v0.3)". shadcn components keep their own animation classes; set menus and popovers to grow from `--transform-origin` (Base UI provides it) and make exits faster than entries.
- Scaffolded with `create-near-app` 10.0.0 (`--frontend next-app`). All versions in `package.json` are pinned exactly; do not upgrade during the hackathon.
- `near-connect-hooks` 1.1.6 itself depends on `@hot-labs/near-connect` ^0.11.1, so `package.json` has `"overrides": { "@hot-labs/near-connect": "0.12.0" }` to keep one copy at 0.12.0 (0.12.0 only adds gas-key APIs; checked against the 0.11.4 type definitions). After changing it, delete `node_modules` and run `bun install` so no nested 0.11.x copy is left.
- Wallet order: on testnet the official manifest filters out HOT (no testnet support), so Meteor is already first in the NEAR Connect popup; no reordering code needed (checked 3 Nov).
- UI: Tailwind CSS 4 + shadcn/ui (`base-nova` style, `components.json`, CLI 4.23.0). Add components with `bunx shadcn@4.23.0 add <name>`; they land in `src/components/ui`. Fonts: Geist (`--font-geist-sans`) and Geist Mono (`--font-geist-mono`, wallet addresses only) via `next/font`; the theme maps `font-sans` / `font-mono` to them (named differently on purpose: `--font-sans: var(--font-sans)` refers to itself and can drop the font).
- Primitives in `src/components/ui` are shadcn's, restyled to the design's components (`design/hellonear.pen`, Atomic Components): `Button` variants `default` (primary), `secondary`/`outline`, `brand` (lime, sparingly), `destructive` (`danger-fill`), `ghost`, `link`; sizes `default` (44 px pill), `sm` (36), `icon` (40 circle) and friends. `Badge` variants `neutral`, `success`, `warning`, `destructive`, `info`, `verified`. Inputs are 44 px, 12 px radius, 16 px text on phones (no iOS zoom). Tabs are the pill segmented control; dialogs 480 px, 24 px radius; overlays use `scrim`; toasts use `toast-bg/fg`. Re-adding a component with the shadcn CLI overwrites these edits, so diff before you accept.
- `AppProviders` wraps the app in `ThemeProvider` (class on `<html>`, so `<html suppressHydrationWarning>`), `QueryClientProvider`, `NearProvider`, `TooltipProvider` and sonner's `Toaster`.
- Colors: `src/styles/globals.css` holds the design's Stone & Lime tokens (copied from the variables in `design/hellonear.pen`), light in `:root`, dark in `.dark`. shadcn names are filled from them (`background` = bg, `card`/`popover` = surface, `muted`/`secondary` = surface-muted, `muted-foreground` = text-secondary, `destructive` = danger, `input` = border-strong, `ring` = focus). shadcn's `accent` stays a quiet hover grey, so **the design's lime `accent` is `brand` here** (`bg-brand`, `text-on-brand`, `bg-brand-soft`, `text-brand-strong`). Other design tokens keep their names: `surface`, `surface-hover`, `border-strong`, `tertiary-foreground`, `success(-soft)`, `warning(-soft)`, `danger(-soft)`, `danger-fill`, `on-danger`, `info(-soft)`, `toast-bg/fg`, `scrim(-soft)`, `node-*`. Radius: `rounded-sm` 8, `md` 12, `lg` 16, `xl` 24. When the design changes a token, change it here too.

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
  lib/                   config (network), utils (cn), api clients, formatting
  providers/             AppProviders (NEAR Connect via near-connect-hooks, client only)
  styles/                globals.css (Tailwind + shadcn tokens)
  types/                 shared types
tests/                   unit tests
```

Imports: `@/*` → `src/*`, `@app/*` → `app/*`. Keep route files in `app/` thin; put screens in `src/modules/<feature>/components`.

## Conventions

- Never hold or send the backend's API keys or grant tokens in the browser; the FE only talks to `apps/be`.
- Wording: say "policy stored on-chain, enforced in a TEE". A rejected transfer shows `policy_denied` and the rule, never a tx link.
- Verification badge follows `docs/api-contract.md` §4: `gateway_tee` (a normal chat run) shows "Verified via NEAR AI TEE gateway", `model_tee` shows "Verified private (model TEE)", anything else no badge.
- Redacted secrets render as `••••`; never try to unredact.
- Use the event shapes in `docs/api-contract.md` (#7); do not invent fields.
- Visual Builder (#20): save the React Flow `{ nodes, edges }` in the canvas format of `docs/api-contract.md` §2 "Visual Builder workflows" (node types `trigger`, `agent`, `tool`, `http`, `condition`; condition edges use `sourceHandle: "then" | "else"`). Show the engine's `issues` on a 400. Light nodes up from `node.started` / `node.finished` (`node` = your canvas node id).
