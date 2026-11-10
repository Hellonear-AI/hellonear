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

Order follows "Landing v0.2" in `design/landing.pen`: Meet the Minds, Every payment asks you first, Tricked? Still can't spend it., Watch your Mind think, Two minutes with a Mind (demo), CTA, footer. The demo video is a placeholder.

Meet the Minds (`components/MindCards.tsx`):
- Heading slides up word by word behind a mask; the subtitle fades in after it.
- Cards are dealt from below one by one, face down (brushed platinum back with the embossed logo), and flip over. The face switch is an opacity step at the flip's 90 deg point, because animating opacity on the 3D card flattens it in Chrome.
- Hover: the card pops up with a small random tilt and the character fades into its second pose (`public/minds/<id>-hover.webp`). Only the Choose button is a link: `${NEXT_PUBLIC_APP_URL}/minds/new?template=<id>` (ids from `GET /v1/templates`; apps/fe still has to read the param). Its hover is the same swipe as Open app.
- Character art: `design/hellonear-assets/minds/` (gitignored originals), `public/minds/` (web copies, same canvas for both poses).

Every payment asks you first (`components/ApprovalsScroll.tsx`, GSAP 3.15.1 + ScrollTrigger): no pin. When the section comes into view the title slides up word by word behind a mask, the subtitle and points slide up one by one, and a big frame (no gap on the right, rounded on the left) opens from the right edge with the scroll (scrubbed, section top 85% to 15%), so the coming move into "Tricked" can continue from it; the copy reverses when scrolling back above. The frame (`ApprovalScene` in `Sections.tsx`) shows `public/scenes/approval-scene.webp` (a high-angle lawn with the Mind lying on it, glancing left; generated, then upscaled 4x with Real-ESRGAN; 4096 px master in `design/hellonear-assets/sections/`). Penny's bubble and the approval card float on their own beside the Mind, light frosted glass (`.glass-float`, blur 3px, a warm sun glare in the top-left corner and a bright top-left edge) with Nabil's shadow (x 18, y 45, blur 10, 45% black), placed in image coordinates and laid on the lawn (rotateX 22deg, rotateZ 12deg). A fine film grain (`.grain`) sits over the frame. The photo and the glass are still (no motion inside the frame besides the scroll). How it moves without jank: the photo and everything on it are one fixed-size stage (1680 x 722, `.ap-stage`) laid out once and only scaled and moved with `transform`; the frame is a window over it (`clip-path` on `.ap-visual`, which covers the pinned screen). Both are driven by two numbers in `ApprovalsScroll.tsx` (`open`, scrubbed before the pin; `track`, pinned), so no layout runs while scrolling and every element keeps its place, like a printed photo. Both phases are linear with the same scrub (0.8), so the hand-off from scrolling to the pin doesn't jolt. Then, on desktop, the section pins for 1600 px: the copy slides left with the photo by the same distance (no fade), the window grows to fill the screen and the stage scales up and tracks left, so the camera moves past the Mind onto the open lawn where "Tricked? Still can't spend it." and its two glass cards, flat and the same size (layer 1: the tricky email, flagged and declined; layer 2: blocked before signing) already lie, in the photo's right part (`.ap-tricked`, faded in as the camera starts to move so it does not peek at rest), and slide in with it. After a short hold on "Tricked?", the pin continues (3150 px in all) into the clouds: blurred cumulus clouds (the hero's, with a static CSS blur) and a light fog rise from the bottom and cover the lawn; under that cover it turns to night (`.ap-sky`, `NIGHT_BG`, stars from `components/Starfield.tsx`) with the Mind Graph's title already in place (`.ap-graph-title`); then the white clouds fade and the title is there on the stars. The Mind Graph section below is the same night with the graph at its top (its own title shows on phones only), so the page reads as one night. Every fade starts at zero slope, so no cloud pops in. The separate Safety section is shown on phones only. Reduced motion: no animation. The approval card copies the Approval Card component in `hellonear.pen`.

Watch your Mind think (`components/MindGraph.tsx`, `SeeInside` in `Sections.tsx`): a full-width night section with stars, continuing the sky the approvals scroll ends in; an Obsidian-style graph of Penny on a faint glass panel, with the same kinds of nodes as the app's live view (skills lime, tools blue, apps with their icons, memory teal, wallet orange; Penny in the middle). Nodes float gently, can be dragged and spring back; hovering one dims everything it isn't connected to. While in view, Penny's run plays: each step lights its edge with a particle running along it, the nodes it touched keep a glow, Penny's ring pulses orange while it waits for the approval, and the "What Penny just did" list (dark glass, `.glass-dark`) ticks along; then it starts again. Plain SVG + requestAnimationFrame (paused off-screen), no graph library. Reduced motion: still graph, all steps shown. The app's live Mind Graph was put on hold on 9 Nov (#17); this one is a landing-only illustration.

## Copy guidelines

- Problem: AI agents that hold money have no limits you can trust. Solution: a Mind whose wallet limits are stored on-chain and enforced in a TEE, with private, verifiable AI.
- Never claim "rejected on-chain"; say "policy stored on-chain, enforced in a TEE before signing".
- Only call inference "private" for NEAR AI Confidential TEE models.
- Money claims follow the #55 decisions: every payment asks the owner first; the per-payment limit and the address list are hard stops; there is no daily limit and no per-skill wallet (one wallet per Mind).
- Connected apps on the page: Gmail, Meteor Wallet and Google Calendar. Calendar is in the final product (#57: backend merged in #62, engine tools in #65); if #65 does not merge before submission, put "soon" back. Brand icons are in `public/brands/` (Gmail from the design file, Meteor and Calendar from their own sites).
- Do not copy another product's characters, names, or visual style.
- English only.
