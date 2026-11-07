# CLAUDE.md — apps/landing

Landing page. Owner: Nabil. Issue: #10.

**Update this file in the same PR whenever you change setup, commands, the framework, deploy target, or copy guidelines.** Root rules in `/CLAUDE.md` also apply.

## Design

Use the tokens and rules in `/design` (`design/CLAUDE.md`): Stone & Lime colors, Geist, no gradients on UI elements, mono only for wallet addresses.

The landing design lives in `design/landing.pen` (frame `Landing v0.1`, plus the note `Hero interaction spec`), not in `hellonear.pen`, so landing and app-screen edits never conflict in one file. Its tokens are a copy of `hellonear.pen`'s; when those change, copy them over.

## Setup

Next.js 16 App Router + Tailwind 4, same pinned versions as `apps/fe`. Bun 1.3.9 (`npx -y bun@1.3.9 …` works without a global install).

```sh
bun install
bun run dev        # http://localhost:3100 (apps/fe keeps 3000)
bun run typecheck
bun run build
```

Env (`.env.example`): `NEXT_PUBLIC_APP_URL`, the web app's URL for "Open app". Not decided yet; empty means the button links to `#`.

Assets: the favicon set comes from `design/logo/favicon/` (`app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png`); `public/mind.png` is `design/landing/mind-cutout.png`. Tokens in `app/globals.css` are copied from `design/landing.pen`.

## Nav (built, 7 Nov)

- On the hero it is a plain transparent bar (logo, links in the middle, Open app). After 24 px of scroll it becomes a white pill across the row (the opposite colour of the dark Open app button); the logo and the button keep their colours. The button icon is Lucide `arrow-up-right`, as in the design. On hover a white layer sweeps in from the left and the button flips to white with dark text (420 ms); on leave it sweeps out to the right. Reduced motion: a plain fade.
- Hover on a link: each letter grows (15 to 22.5 px) and turns semibold, starting from the middle of the word and spreading to both ends (40 ms per letter). The links are a centred group, so the hovered link keeps its place and its neighbours move aside. Pointer devices only; reduced motion keeps only the colour change.

## Copy guidelines

- Problem: AI agents that hold money have no limits you can trust. Solution: a Mind whose wallet limits are stored on-chain and enforced in a TEE, with private, verifiable AI.
- Never claim "rejected on-chain"; say "policy stored on-chain, enforced in a TEE before signing".
- Only call inference "private" for NEAR AI Confidential TEE models.
- Money claims follow the #55 decisions: every payment asks the owner first; the per-payment limit and the address list are hard stops; there is no daily limit and no per-skill wallet (one wallet per Mind).
- Only name connected apps that work on `main`: Gmail today; Google Calendar is planned (#57).
- Do not copy another product's characters, names, or visual style.
- English only.
