# CLAUDE.md — design/

Source of truth for HelloNear's visual design: design tokens, app screens, Mind characters, and reference images. Owner: Nabil. Issue: #10. Consumed by `apps/fe` (Ancung) and `apps/landing` (Nabil).

**Update this file in the same PR whenever you add a design file, rename a token, or change a rule below.** Root rules in `/CLAUDE.md` also apply.

## Files

| Path | What |
|---|---|
| `hellonear.pen` | Main design file (pen.dev / Pencil). Frames: `0 · Start here` (how to read the file), Design Reference, Font Reference, Design Tokens · Light/Dark, `HelloNear · Atomic Components`, `HelloNear · States & Interactions`, `HelloNear · Product map`, sections `3 · Start` to `8 · Attack Playground`, and `Archive · v0.1 screens` |
| `hellonear-assets/` | Reference images (third-party, from Pinterest) used by the Design Reference and Font Reference frames. **Gitignored and kept on Nabil's machine only**, so those two frames look empty for everyone else. Never commit or ship them |

Open `.pen` files in pen.dev or through the Pencil MCP tools. `hellonear.pen` is plain JSON on disk, but edit it only through pen.dev / Pencil so ids and layout stay valid. pen.dev keeps edits in memory until you press Ctrl+S; check `git diff` before committing.

## Design tokens (v0.1 draft, "Stone & Lime")

Tokens live as variables in `hellonear.pen`, with a `mode` theme (`light`, `dark`). Code in `apps/fe` and `apps/landing` should use the same token names.

- Color: `bg`, `surface`, `surface-muted`, `border`, `border-strong`, `text-primary`, `text-secondary`, `text-tertiary`, `primary`, `on-primary`, `accent` (lime), `on-accent`, `accent-soft`, `accent-strong`, `success`, `warning`, `danger`, `on-danger`, `info` (each status has a `-soft` background), `shadow`.
- Interaction colors (v0.2): `primary-hover`, `accent-hover`, `danger-hover`, `surface-hover`, `focus` (keyboard focus ring; dark lime in light mode because bright lime on cream is about 1.2:1), `toast-bg`, `toast-fg`, `scrim`, `scrim-soft` (backdrops behind dialogs and sheets), `danger-fill` (solid red buttons; a deeper red in dark mode so `on-danger`, white in both modes, keeps about 5:1; `danger` stays the bright red for red text and icons).
- Contrast (v0.2): light-mode `success` #1A7340, `warning` #945800, `danger` #BF3220, `info` #2A5BC7 and `text-tertiary` (#696660 light, #8E8B83 dark) were darkened so text on `bg`, `surface` and the `-soft` backgrounds passes WCAG AA (4.5:1). The v0.1 values measured 3.5 to 4.49.
- Mind Graph node colors: `node-mind`, `node-skill`, `node-tool`, `node-app`, `node-wallet`, `node-memory`, `node-model`; denied/error edges use `danger`.
- Type: `font-heading` (Geist, placeholder until a heading font is chosen), `font-body` (Geist), `font-mono` (Geist Mono). Sizes `size-display` 64, `size-h1` 48, `size-h2` 36, `size-h3` 24, `size-title` 18, `size-body` 16, `size-small` 14, `size-caption` 12.
- Spacing: `space-1` 4 … `space-24` 96 (4-pt scale).
- Radius: `radius-sm` 8, `radius-md` 12, `radius-lg` 16, `radius-xl` 24, `radius-full` 999 (buttons, badges).

## Rules

- Visual direction: minimal and modern (Apple-like), clean with a warm touch. Warmth comes from warm neutrals and photography, not from many UI colors.
- **No gradients on UI elements** (buttons, cards, badges, inputs, chips). Gradients are fine inside photos and background imagery.
- One accent color (lime), used sparingly. Primary actions are solid black (light mode) / off-white (dark mode).
- **Mono font only for wallet addresses.** Nowhere else, not for amounts, ids or hashes.
- Every screen must work in light and dark mode.
- Mind characters: do not copy HelloMinds/Animoca characters or their "collector toy box" look.
- Copy follows `apps/landing/CLAUDE.md` (never "rejected on-chain"; "private" only for Confidential TEE models).

## Components and states (v0.2)

- `HelloNear · Atomic Components` holds every reusable component, named `Group/Variant` (`Button/Primary`, `Badge/Warning`, `Meter/Frozen`, `Nav/Active`, ...), in three sections: atoms, molecules, organisms. Screens should use instances of these, not hand-built copies.
- `HelloNear · States & Interactions` shows each component in every state (default, hover, pressed, focus, disabled, loading, error and the money lifecycle: waiting, signing in Meteor, approved, declined, expired), the motion rules, and a dark-mode check.
- Motion: press 98% for 100 ms; hover 150 ms ease out (mouse only); focus ring 2 px `focus`, 2 px outside, keyboard only; state change crossfade 200 ms; enter fade + 8 px rise 200 ms, leave 150 ms; ease out (0.2, 0, 0, 1), no bounce on money; reduced motion means fades only.
- Recent chats (#54) show in the desktop and tablet sidebar too, under the menu, with a New chat button; the open chat is highlighted only on chat screens. The folded rail has no chat list.
- Theme lives in the account menu (N1.8), opened from the account row at the bottom of the sidebar, the rail avatar, or the phone drawer's gear: Appearance System (default, follows the device), Light or Dark, then Sign out. It applies to the whole app, not per Mind.
- Sidebar opens and folds: desktop starts open (256) with a fold button that turns it into the icon rail (72) and widens the content, and remembers the choice; tablet starts as the rail, whose top button opens the full sidebar over the content with the page dimmed (N1.5, N1.6).
- Navigation by size: sidebar (256) on desktop 1440, icon rail (72) on tablet 834, and on phone 390 a top bar (menu, Mind switcher, Approvals with a count) plus a left drawer with every place and Recent chats (picked over a bottom bar on 6 Nov; Recent chats needs #54). Approvals always show their count: sidebar, rail and phone top bar. Screens are designed at those three widths and checked at 320.
- Money rules (decided in #55, 6 Nov): every payment asks the owner in the app (no wallet signature to approve; OutLayer signs after its checks). The per-payment limit (at most 10 NEAR) and the address list (1 to 20) are hard stops: blocked even if approved, no transaction link. There is no daily limit; the wallet shows "Spent today" (`Spent today/Normal`, `Spent today/Frozen`) as a count, not a limit. Each Mind has one wallet, no per-skill wallets; adding or removing a skill needs no signature. Deleting a Mind is always allowed and warns that its balance stays in its wallet. Approvals don't expire. The coin-tile `Meter/*` components are retired; don't use them in screens.
- Page titles are the `Page Title/Large` (32/15, desktop and tablet) and `Page Title/Small` (26/14, phone) components; the actions beside them (buttons, search, balance) stay free per screen. All 178 page headers in sections 3 to 8 use them. The Gmail logo is `Logo/Gmail`. Loading uses `Skeleton/Skill Card` and `Skeleton/Job`.
- Not components on purpose: phone sheets (only the shell and the `Grabber` are shared; each sheet's content is its own, and pen.dev components have no slot for free content) and the one-off Wallet loading layout (W1.5).
- No shield, zap, sparkles or rocket icons; the verification badge uses `badge-check`.
- Verification badge wording follows `docs/api-contract.md` §4: a normal chat reply is "Verified via NEAR AI TEE gateway" (`gateway_tee`, the `Badge/Verified` default); "Verified private (model TEE)" only when every step ran in the model TEE; anything else, incognito models included, gets no badge. In the model picker, TEE models are marked "Private (model TEE)".
- `node-mind` flips to near-white in dark mode, so icons on it use `on-primary` there (lime on near-white is unreadable).
- The live view map sits in a centered 360 x 240 `Graph` frame, so it stays centered in any panel width.

## Mind characters (#13, v0.3 draft)

Frame `Mind Characters v0.3` in `hellonear.pen` (earlier tries were removed). One shared base character for every Mind; the outfit color and one prop change with its job.

- Same for all: big puffy cloud-shaped head on a small body with short limbs, matte vinyl finish, **charcoal** base color (cream was the alternative), flat half-moon eyes with a heavy lid and pupils glancing sideways (deadpan but cute), a small rounded **lime beak**, pink blush, and a lime sprout on top (the HelloNear mark).
- Per Mind: General Assistant = lime hoodie, waving; Payments Mind = mustard quilted vest, brown pouch, lime padlock pin, arms crossed; Email Manager = orange mail cap and messenger bag, holding an envelope.
- Inspired by big-head designer toys, but drawn our own way. Never copy a specific existing character (e.g. ZXSW's duck, HUH, HelloMinds): references are for mood only.
- Avoid: collector-toy packaging, fur or busy textures, logos, text or currency symbols on props, gradients behind characters in the app UI.
- 3D (Three.js) is only considered for the landing page hero; in the app, characters are images and their use is up to `apps/fe`.
- Current art: `generated-10.png` (base) to `generated-14.png` (cream base), AI renders from pen.dev. More poses and expressions are planned in Blender, exported as transparent PNGs.
- Character references live in `hellonear-assets/char-ref/` (gitignored).
- Prompts used for v0.3 (and tips to stay on-model in other generators): `characters/prompts.md`. pen.dev images are made by Google generative AI (C2PA label, SynthID watermark); the files are JPEG despite the `.png` name.

## Copywriting (UX first, draft; Ancung may extend)

- Write for the user, not the engineer. No technical words in the UI: say "Blocked" not `policy_denied`, "your limits are saved where your Mind can't change them" not "TEE-enforced policy", "sign with your wallet" not "NEP-413".
- **No em dashes (—).** Use a period, a comma, or a colon instead.
- Be transparent: when something is blocked, waiting, or costs money, say what happened, why, and what the user can do next.
- Short sentences, plain verbs, sentence case for buttons ("Connect wallet", "Allow").
- Amounts always show the token (`2 NEAR`). Wallet addresses use the mono font.
- Testnet is stated plainly: "Running on NEAR testnet. No real money."
- Never mention the hackathon or call the product a "demo" in the UI. The shared try-out wallet's addresses are "test addresses".

## Screens (v0.2)

Screens live in sections `3 · Start` to `8 · Attack Playground`, one board per screen code from the Product map (L1 to L3, T1 try-out, C1, C2, N1 navigation, M1 Mind settings, E1 app states (signed out, offline, not found), W1 to W5, A1, S1 to S3, K1, K2, P1, B1, X1). Also W1.6 (a Mind with no wallet yet), W5.5 (a failed payment) and C1.7 (Email helper: summary and a Gmail draft, never sent by the Mind). Removed by #55: W1.3 (near the daily limit), A1.5 (expired approval), S2.3 (waiting for Meteor), S3.2 and S3.3 (skill wallet limits and taking money back). Each row of a board is one state with a code (`W1.2`), a name and a note; frames are drawn at desktop 1440, tablet 834 and phone 390 ("full page" phone frames show the whole scroll). Every main screen has its empty, loading, error and blocked states.

- Content follows what the backend and engine really do (`docs/api-contract.md`): the five real skills, Gmail as the only app, keys with allowed sites, Autopilot that can't move money or use keys, Attack Playground stops from the per payment limit, the address list and freeze (#16), plus a fake bill that Penny flags instead of paying (X1.5), no transaction link for a stop.
- Try-out (T1, #43): "Try without a wallet" sits under the wallets on sign-in and skips Set limits. A lime banner shows messages left (20) and the shared test wallet's limit (0.05 NEAR per payment, approved addresses). Owner actions (freeze, limits, keys, Autopilot, own wallet) open "Connect a wallet to do this"; after 20 messages the chat ends with Connect Meteor.
- Mind wallets are NEAR implicit accounts (64 hex characters, shown shortened like `7a1c90e2…a84f3b`), not named sub-accounts.
- Builder is a full-screen mode, like a design tool: no sidebar or rail, only a top bar with a back arrow (no label, since people may arrive from a link; it always goes to Autopilot), approvals with their count, Test run and Save. It opens only from Autopilot (Edit steps, New job); there is no Builder menu item (decided 6 Nov). Adding a block: drag from the block list on desktop, and on every size a + marks each spot the engine accepts (between steps, before the If, an empty Yes or No ending; never before Start or after an ending). On phones there is no dragging: tap a +, pick from a sheet that only lists blocks that fit there, and the new block's settings open (WCAG 2.2, 2.5.7). A tapped block opens its settings in a sheet. Phones have no schedule switch in Builder; turning a job on or off lives in Autopilot. The If block's endings are labeled Yes and No.
- Empty, no results and couldn't-load states fill the whole content area (full width and height, content centered) instead of a small box at the top. Phone frames for those states are one screen (844), not full page.
- Autopilot on tablet and phone is list first: tapping a job opens its own detail page (P1.6); desktop keeps list and detail side by side.
- The v0.1 screens (light and dark) moved to `Archive · v0.1 screens`; don't build from them.
- Dark mode: each section `3 · Start` to `8 · Attack Playground` is a component, and `<section> · Dark` beside it (400 px to the right, same y) is an instance of it with the `dark` theme. **Edit only the light section**; the dark one follows by itself. Never edit inside a dark mirror. When restacking sections, move each dark mirror with its section.
- Colors in screens come from tokens. The only fixed colors are the Gmail logo red and the white caption card on the sign-in photo (it sits on a photo, so it stays light). Dialog and sheet backdrops use `scrim` / `scrim-soft` (v0.2), which are darker in dark mode.
- L1.5 "What is a Mind?": opened from the link on sign-in; three points (talks with you, has its own wallet, can't go past your limits) and Got it. Dialog on desktop and tablet, bottom sheet on phone.
- Chat replies in the screens are samples. Real replies come from the model, shaped by the template's `soul` in `engine/templates/*.json` (Axel). The voice samples in C1.1 and C1.2 only show a direction; they need a matching `soul.identity` change to happen. Static UI text (buttons, notices, the C1.2 empty state, the L2 card quotes) is ours; the L2 quotes have no API field yet, so the FE hardcodes them per template unless a field is added.
- The example Mind in every screen is "Penny" (Payments Mind); it is sample content, not a product name.
