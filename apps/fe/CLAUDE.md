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
- Tests: `vitest` 5.1.0 (unit, `tests/*.test.ts`, config `vitest.config.mts`), `@playwright/test` 1.65.0 (flows).
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
bun run test       # unit tests (vitest)
```

Env (`.env.example`, names only, no secrets; both are read when `next dev` / `next build` starts, so restart after changing them):
- `HELLONEAR_API_URL`: the backend that `/api/v1/*` is forwarded to in local dev (default `http://localhost:4000`; hosted demo `https://api-hellonear.jameshub.fun`).
- `NEXT_PUBLIC_API_URL`: set only for the hosted FE. The browser then calls the API directly instead of the proxy.

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

Routes: `/` sign in (for now the old header in `PublicShell` with `SignInButton`, and a link to the newest Mind), `/minds/new` Choose a Mind, and `/minds/[mindId]/{chat,chat/[threadId],wallet,approvals,skills,autopilot,connections,attack,settings}` inside `AppShell`; `/minds/[mindId]` redirects to chat and an unknown Mind is not found. Builder will open from Autopilot (no nav item).

App shell (`src/components/layout`, design N1): phone below 768 px (`md`) gets `MobileHeader` (menu, Mind switcher sheet, Approvals count) and a left drawer; tablet 768 to 1279 gets the 72 px rail whose top button opens the full sidebar over the page; desktop from 1280 (`xl`) gets the 256 px sidebar that folds into the rail (saved in `localStorage` as `hellonear.sidebar.folded`). `MindSwitcher` and `AccountMenu` (Appearance System/Light/Dark, Sign out) each have trigger variants for these places. Nav items live in `nav.ts`.

Minds data (`src/modules/minds`): `api.ts` calls `GET /minds`, each Mind's `GET …/wallet` (`null` on 404 `no_wallet`), `GET …/approvals` and `GET …/threads`; `hooks/useMinds.ts` turns them into what the shell shows (`Mind`, `RecentChat` in `data/minds.ts`) and only runs with a session. A wallet that can't be read (e.g. 502 `outlayer_error`) leaves the Mind listed without a balance. Approvals refresh every 30 s. Balances show two decimals rounded down (`formatNear` in `src/lib/format.ts`); Recent chats show `shortWhen` (Today, Yesterday, weekday, date). Template labels and images come from `templateLabel` / `templateImage` (unknown template ids fall back to the General Assistant image). Mind images are in `public/minds/` (from the design).

`MindGate` wraps every `/minds/[mindId]` screen: no session goes back to `/`, and a Mind that isn't one of the user's (unknown, deleted, someone else's) is the not-found page (E1.3). It runs in the browser because on the hosted site the session cookie belongs to the API's host. The home screen opens the newest Mind, or offers "Create your first Mind" (`/minds/new`).

Choose a Mind (`/minds/new`, design L2, `ChooseMindScreen`): needs a session (else back to `/`), loads `GET /templates`, and shows them as three cards from 1280 px (`xl`) and a list below. Picking a template fills in a suggested name (`data/templates.ts`: Ava, Penny, Iris) unless the user typed their own. The name rule is checked as you type: 2 to 24 letters or numbers (stricter than the backend's 1 to 64). Card order, suggested names and short skill labels live in `data/templates.ts`; the API's skill descriptions are written for the model, so skills without a label are not shown. Continue calls `POST /minds`, puts the new Mind in the cached list (so `MindGate` knows it at once) and opens its Wallet screen, where step 2 (spending limit, L3) will be built.

Imports: `@/*` → `src/*`, `@app/*` → `app/*`. Keep route files in `app/` thin; put screens in `src/modules/<feature>/components`.

## Backend and sign-in

- **Local dev** (`NEXT_PUBLIC_API_URL` unset): the browser calls `/api/v1/*` on our own origin and `next.config.js` forwards it to `HELLONEAR_API_URL`, so the `hn_session` cookie belongs to our origin. That is what lets `http://localhost:3000` sign in against the hosted API (its cookie is `SameSite=Lax` and `Secure`; Chrome and Firefox accept `Secure` on localhost, Safari is not checked yet). The backend still checks the forwarded `Origin` against its `FE_ORIGIN` list (#71), so a new FE origin must be added there.
- **Hosted** (`NEXT_PUBLIC_API_URL=https://api-hellonear.jameshub.fun`): the browser calls the API directly. It is the same site as `hellonear.jameshub.fun`, so the `SameSite=Lax` cookie is sent, and the backend sees each visitor's IP. Try-out limits are per IP (`cf-connecting-ip`), and through a proxy every visitor would share the host's IP (James, #73).
- Call the backend with `api()` from `src/lib/api.ts` (`credentials: "include"`, JSON). Failures throw `ApiError` with `status`, `code` (the backend's `error`) and `details`.
- Sign-in (`src/modules/auth`, NEP-413, `docs/api-contract.md` §7): connect a wallet if none is connected, `POST /auth/challenge`, the wallet signs exactly `{ message, recipient, nonce }` (nonce decoded from base64 to 32 bytes; recipient comes from the challenge, `hellonear.app` on the hosted demo), then `POST /auth/login`. `useSignIn` signs through `connector.wallet()` / `connector.connect()` because the hook's own `signNEP413Message` reads wallet state from the previous render. `useSession` is the `["session"]` query (`GET /me`, `null` on 401); `useSignOut` logs out, disconnects the wallet and clears the query cache. The account shown in the app is the session's `nearAccountId`, not the wallet's.
- Proven 8 Nov: a Meteor (testnet) login from `http://localhost:3000` in Chrome against the hosted API (`HELLONEAR_API_URL=https://api-hellonear.jameshub.fun` in `.env.local`, after #71 was deployed); the session survives a reload. Not checked yet: Safari and other wallets. 

## Conventions

- **Everything clickable shows a pointer cursor** (team rule, 6 Nov). `globals.css` sets it in the base layer for buttons, links, labels, tabs, menu items, options, switches, checkboxes and anything with `role="button"`; disabled gets `not-allowed`. If you make a clickable `div` or `span`, give it `role="button"` (and keyboard support) or `cursor-pointer`. Never use `cursor-default` on something clickable.
- Never hold or send the backend's API keys or grant tokens in the browser; the FE only talks to `apps/be`.
- Wording: say "policy stored on-chain, enforced in a TEE". A rejected transfer shows `policy_denied` and the rule, never a tx link.
- Verification badge follows `docs/api-contract.md` §4: `gateway_tee` (a normal chat run) shows "Verified via NEAR AI TEE gateway", `model_tee` shows "Verified private (model TEE)", anything else no badge.
- Redacted secrets render as `••••`; never try to unredact.
- Use the event shapes in `docs/api-contract.md` (#7); do not invent fields.
- Visual Builder (#20): save the React Flow `{ nodes, edges }` in the canvas format of `docs/api-contract.md` §2 "Visual Builder workflows" (node types `trigger`, `agent`, `tool`, `http`, `condition`; condition edges use `sourceHandle: "then" | "else"`). Show the engine's `issues` on a 400. Light nodes up from `node.started` / `node.finished` (`node` = your canvas node id).
- Skill picker: offer every skill from the backend's `GET /v1/skills` (once it exists; `docs/api-contract.md` §7), with `status` and `note` shown, not only the template's skills. A Builder workflow can only use tools of skills the Mind has equipped (`tools` in that list).
- Autopilot (#21, schedule UI): toggle with `PUT …/autopilot` (`enabled`), show `nextFireAt` and `pausedFor` reasons, and a run history from `GET …/runs` (`trigger: autopilot | manual`, per-node status in run order; poll while a run is `running`). Scheduled runs have no live stream and no badge.
