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

Env (`.env.example`): `NEXT_PUBLIC_APP_URL`, the web app's URL for "Open app" and the Mind cards. Default `https://app.hellonear.xyz` (#125); the landing itself will be `https://hellonear.xyz`.

Assets: the favicon set comes from `design/logo/favicon/` (`app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png`). Tokens in `app/globals.css` are copied from `design/landing.pen`. `public/draco/` is three.js's Draco decoder (for the GLB).

## Nav (built, 7 Nov)

- On the hero it is a plain transparent bar (logo, links in the middle, Open app). After 24 px of scroll it becomes a white pill across the row (the opposite colour of the dark Open app button); the logo and the button keep their colours. The button icon is Lucide `arrow-up-right`, as in the design. On hover a white layer sweeps in from the left and the button flips to white with dark text (420 ms); on leave it sweeps out to the right. Reduced motion: a plain fade.
- Hover on a link: each letter grows (15 to 22.5 px) and turns semibold, starting from the middle of the word and spreading to both ends (40 ms per letter). The links are a centred group, so the hovered link keeps its place and its neighbours move aside. Pointer devices only; reduced motion keeps only the colour change.

## Hero (built, 7 Nov)

- Layout: copy on the left over the sky, a big 3D Mind on the right peeking over a grass slope and gripping the crest. Parallax 2.5D: sky, cumulus, middle hill and foreground (Mind + slope) move at different speeds with the cursor and on scroll (`useParallax` in `components/hero/Hero.tsx`).
- Sky is drawn in code (SVG gradient with colours sampled from the sky art, a warm sun glow top-left, thin cirrus). Sun rays: three wide soft beams from the top-left (`.hero-rays`, screen blend). The front grass is a WebGL canvas (`components/hero/GrassSlope.tsx`) whose blade tips sway, with a gust of light sweeping across.
- The Mind is `public/hero/mind.glb` (`components/hero/MindStage.tsx`), rigged in Blender from the Hunyuan model (scripts in the gitignored `design/hellonear-assets/3d-mv/`: `fix_eyes.py`, `fix_blush.py`, `fix_face.py`, `extract_hands.py`, `build_rig_v4.py`, `render_mobile.py`). Bones: body (squash, stretch, slide), head (turned toward the cursor by the page), a two-joint sprout, two beak lips, and hands. Clips: `enter` (plays once on load), `idle` (loop), `hi` (one shot on a click on the head, then back to idle). Eyes, lids and blinks are driven by the page.
- The hands are 2D images (`grip-*`, `wave-left`), relit to match the 3D light (sun from the left), and moved in step with the clips through `onClip`: in `enter` they rise from behind the hill and grab the crest; in `hi` the screen-left hand waves twice. The rig's 3D hands are hidden.
- Phones (under 768 px): no WebGL and no parallax; the Mind is `mobile-back.webp` (rendered from the same rig) with the same 2D hands.
- Light on the Mind comes from the left (the sun), with a low fill so the right side reads as shadow.
- Reduced motion: no parallax, no wind, no rays animation, no cursor follow.

## Powered by (#99)

`components/PoweredBy.tsx`, right under the hero: a "Powered by" label and one row of logos sliding left in a loop (45 s), drawn twice for a seamless loop, edges faded, paused on hover, static for reduced motion. Logos are in `public/brands/powered/` (copied from `design/brands/`, sources in its README); each has its own height so they look the same size. Only services that really run (checked in the code); Google is left out by its brand rules.

## Sections under the hero (first pass, 8 Nov)

Order follows "Landing v0.2" in `design/landing.pen`: Meet the Minds, Every payment asks you first, Tricked? Still can't spend it., Watch your Mind think, Two minutes with a Mind (demo), CTA, footer. Mind Graph and the demo video are placeholders.

Meet the Minds (`components/MindCards.tsx`):
- Heading slides up word by word behind a mask; the subtitle fades in after it.
- Cards are dealt from below one by one, face down (brushed platinum back with the embossed logo), and flip over. The face switch is an opacity step at the flip's 90 deg point, because animating opacity on the 3D card flattens it in Chrome.
- Hover: the card pops up with a small random tilt and the character fades into its second pose (`public/minds/<id>-hover.webp`). Only the Choose button is a link: `${NEXT_PUBLIC_APP_URL}/minds/new?template=<id>` (ids from `GET /v1/templates`; apps/fe still has to read the param). Its hover is the same swipe as Open app.
- Character art: `design/hellonear-assets/minds/` (gitignored originals), `public/minds/` (web copies, same canvas for both poses).

Every payment asks you first (`components/ApprovalsScroll.tsx`, GSAP 3.15.1 + ScrollTrigger): the title comes up right under the cards, rises to the middle of the screen and holds there, while it runs in from the right edge like running text (one huge line, 80% of the screen wide; each letter is small while entering at the edge and full size once inside). The section then pins (2300 px of scroll): the line finishes in the first 900 px, then the title shrinks into the left column as two lines (the second line drops first, then slides, so they never cross), and a big frame swipes in from the right edge once the title is almost in place (no gap on the right, rounded on the left): `public/scenes/approval-scene.webp` (a high-angle lawn with the Mind lying on it, glancing left; generated, then upscaled 4x with Real-ESRGAN; 4096 px master in `design/hellonear-assets/sections/`), with no outer card: Penny's bubble and the approval card float on their own, close together, left of the Mind, each light frosted glass (`.glass-float`, blur 6px) with a shadow down-right; placed in image coordinates (the image keeps its aspect at the frame height, anchored left) and laid on the lawn (rotateX 22deg, rotateZ 12deg); no transition on them and a fine film grain (`.grain`, soft-light SVG noise) over the frame (`ApprovalScene` in `Sections.tsx`). The subtitle and points are not scrubbed: they play when the title has landed and reverse when scrolling back. Phones: no pin, simple slide-ups. Reduced motion: no animation. The approval card copies the Approval Card component in `hellonear.pen` (the app's Approvals page is still a placeholder).

## Copy guidelines

- Problem: AI agents that hold money have no limits you can trust. Solution: a Mind whose wallet limits are stored on-chain and enforced in a TEE, with private, verifiable AI.
- Never claim "rejected on-chain"; say "policy stored on-chain, enforced in a TEE before signing".
- Only call inference "private" for NEAR AI Confidential TEE models.
- Money claims follow the #55 decisions: every payment asks the owner first; the per-payment limit and the address list are hard stops; there is no daily limit and no per-skill wallet (one wallet per Mind).
- Connected apps on the page: Gmail, Meteor Wallet and Google Calendar. Calendar is in the final product (#57: backend merged in #62, engine tools in #65); if #65 does not merge before submission, put "soon" back. Brand icons are in `public/brands/` (Gmail from the design file, Meteor and Calendar from their own sites).
- Do not copy another product's characters, names, or visual style.
- English only.
