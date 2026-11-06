# CLAUDE.md — design/

Source of truth for HelloNear's visual design: design tokens, app screens, Mind characters, and reference images. Owner: Nabil. Issue: #10. Consumed by `apps/fe` (Ancung) and `apps/landing` (Nabil).

**Update this file in the same PR whenever you add a design file, rename a token, or change a rule below.** Root rules in `/CLAUDE.md` also apply.

## Files

| Path | What |
|---|---|
| `hellonear.pen` | Main design file (pen.dev / Pencil). Frames: Design Reference, Font Reference, Design Tokens · Light, Design Tokens · Dark, `HelloNear · Atomic Components`, `HelloNear · States & Interactions`, and one frame per screen |
| `hellonear-assets/` | Reference images (third-party, from Pinterest) used by the Design Reference and Font Reference frames. **Gitignored and kept on Nabil's machine only**, so those two frames look empty for everyone else. Never commit or ship them |

Open `.pen` files in pen.dev or through the Pencil MCP tools. `hellonear.pen` is plain JSON on disk, but edit it only through pen.dev / Pencil so ids and layout stay valid. pen.dev keeps edits in memory until you press Ctrl+S; check `git diff` before committing.

## Design tokens (v0.1 draft, "Stone & Lime")

Tokens live as variables in `hellonear.pen`, with a `mode` theme (`light`, `dark`). Code in `apps/fe` and `apps/landing` should use the same token names.

- Color: `bg`, `surface`, `surface-muted`, `border`, `border-strong`, `text-primary`, `text-secondary`, `text-tertiary`, `primary`, `on-primary`, `accent` (lime), `on-accent`, `accent-soft`, `accent-strong`, `success`, `warning`, `danger`, `on-danger`, `info` (each status has a `-soft` background), `shadow`.
- Interaction colors (v0.2): `primary-hover`, `accent-hover`, `danger-hover`, `surface-hover`, `focus` (keyboard focus ring; dark lime in light mode because bright lime on cream is about 1.2:1), `toast-bg`, `toast-fg`.
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
- Navigation by size: sidebar (256) on desktop 1440, icon rail (72) on tablet 834, top bar + 5-tab bottom bar on phone 390. Screens are designed at those three widths and checked at 320.
- Limit meter: "coin tiles", 10 tiles of 1 NEAR with a lock cap; the headline is what is left today. Amber from 80%, red at the limit, grey with a snowflake when frozen.
- No shield, zap, sparkles or rocket icons; "Verified private" uses `badge-check`.

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

## Screens (v0.1, main states only)

Login, Choose a Mind, Chat + Mind Graph, Skills, Skill permission, Wallet, Approvals + Freeze, Attack Playground, Connections, Builder, Autopilot. Each has a light frame (`NN Name`) and a dark copy (`NN Name · Dark`, frame theme `mode: dark`). Edge states (offline, loading, empty, errors) come after the main screens are agreed.

- The sidebar is a reusable component; mark the active item by overriding `Nav <Item>`, `Nav <Item> Icon` and `Nav <Item> Label`.
- `node-mind` flips to near-white in dark mode, so icons on it use `on-primary` there (lime on near-white is unreadable).
- The example Mind in every screen is "Penny" (Payments Mind); it is sample content, not a product name.
