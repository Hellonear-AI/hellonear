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

Env (`.env.example`): `NEXT_PUBLIC_APP_URL`, the web app's URL for "Open app" and the Mind cards; `NEXT_PUBLIC_DEMO_VIDEO_URL`, the demo video (default `/demo/demo.mp4`). Default `https://app.hellonear.xyz` (#125); the landing itself will be `https://hellonear.xyz`.

Assets: the favicon set comes from `design/logo/favicon/` (`app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png`). Tokens in `app/globals.css` are copied from `design/landing.pen`. `public/draco/` is three.js's Draco decoder (for the GLB).

## Page loader (11 Nov)

`components/PageLoader.tsx`, in `app/layout.tsx`, so it is in the server HTML and nobody sees an empty page. The Mind mark from the logo builds itself on the page colour: the head's bubbles (separate circles) pop in one by one, the sprout grows, the eyes open and blink, then it breathes; a lime line shows progress. It lifts once the page has loaded and, on desktop, the 3D Mind is in (`hn:mind-loaded` from `MindStage.tsx`), after at least 1.3 s and at most 8 s; then it sends `hn:reveal` and the Mind's entrance plays in view (the model stays hidden until then). In-page links (nav, footer, hero and CTA buttons) don't scroll through the page: the loader covers it for a moment, the page jumps to the target and the loader lifts. On desktop, Safety lands on the Tricked cards (section top + 1700 px) and Skills on the Mind Graph title (+ 3150 px), points inside the pinned approvals scroll. Reduced motion: no building or breathing, a short fade.

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

Order follows "Landing v0.2" in `design/landing.pen`: Meet the Minds, Every payment asks you first, Tricked? Still can't spend it., Watch your Mind think, Two minutes with a Mind (demo), CTA, footer.

Meet the Minds (`components/MindCards.tsx`):
- Heading slides up word by word behind a mask; the subtitle fades in after it.
- Cards are dealt from below one by one, face down (brushed platinum back with the embossed logo), and flip over. The face switch is an opacity step at the flip's 90 deg point, because animating opacity on the 3D card flattens it in Chrome.
- Hover: the card pops up with a small random tilt and the character fades into its second pose (`public/minds/<id>-hover.webp`). Only the Choose button is a link: `${NEXT_PUBLIC_APP_URL}/minds/new?template=<id>` (ids from `GET /v1/templates`; apps/fe still has to read the param). Its hover is the same swipe as Open app.
- Character art: `design/hellonear-assets/minds/` (gitignored originals), `public/minds/` (web copies, same canvas for both poses).

Every payment asks you first (`components/ApprovalsScroll.tsx`, GSAP 3.15.1 + ScrollTrigger): no pin. When the section comes into view the title slides up word by word behind a mask, the subtitle and points slide up one by one, and a big frame (no gap on the right, rounded on the left) opens from the right edge with the scroll (scrubbed, section top 85% to 15%), so the coming move into "Tricked" can continue from it; the copy reverses when scrolling back above. The frame (`ApprovalScene` in `Sections.tsx`) shows `public/scenes/approval-scene.webp` (a high-angle lawn with the Mind lying on it, glancing left; generated, then upscaled 4x with Real-ESRGAN; 4096 px master in `design/hellonear-assets/sections/`). Penny's bubble and the approval card float on their own beside the Mind, light frosted glass (`.glass-float`, blur 3px, a warm sun glare in the top-left corner and a bright top-left edge) with Nabil's shadow (x 18, y 45, blur 10, 45% black), placed in image coordinates and laid on the lawn (rotateX 22deg, rotateZ 12deg). A fine film grain (`.grain`) sits over the frame. The photo and the glass are still (no motion inside the frame besides the scroll). How it moves without jank: the photo and everything on it are one fixed-size stage (1680 x 722, `.ap-stage`) laid out once and only scaled and moved with `transform`; the frame is a window over it (`clip-path` on `.ap-visual`, which covers the pinned screen). Both are driven by two numbers in `ApprovalsScroll.tsx` (`open`, scrubbed before the pin; `track`, pinned), so no layout runs while scrolling and every element keeps its place, like a printed photo. Both phases are linear with the same scrub (0.8), so the hand-off from scrolling to the pin doesn't jolt. Then, on desktop, the section pins for 1600 px: the copy slides left with the photo by the same distance (no fade), the window grows to fill the screen and the stage scales up and tracks left, so the camera moves past the Mind onto the open lawn where "Tricked? Still can't spend it." and its two glass cards, flat and the same size (layer 1: the tricky email, flagged and declined; layer 2: blocked before signing) already lie, in the photo's right part (`.ap-tricked`, faded in as the camera starts to move so it does not peek at rest), and slide in with it. After a short hold on "Tricked?", the pin continues (3150 px in all) into the clouds: blurred cumulus clouds (the hero's, with a static CSS blur) and a light fog rise from the bottom and cover the lawn; under that cover it turns to night (`.ap-sky`, `NIGHT_BG`) with the Mind Graph's title already in place, centred and large (72 px); then the white clouds fade and the title is there on the night. The film grain fades out with the photo, so the night is the exact section colour. The Mind Graph section below is the same night with the graph at its top (its own title shows on phones only); on desktop it is pulled up under the centred title (`-mt-[calc(50vh-130px)]`, z-10, its top part see-through via `.graph-section`), so the graph starts right below the title and already rises in as the clouds clear. Every fade starts at zero slope, so no cloud pops in. The separate Safety section is shown on phones only. Reduced motion: no animation. The approval card copies the Approval Card component in `hellonear.pen`.

Watch your Mind think (`components/MindGraph.tsx`, `SeeInside` in `Sections.tsx`): a full-width night section (`NIGHT_BG` in `components/night.ts`; no stars), continuing the night the approvals scroll ends in. A world of Minds drawn like Obsidian's graph view: Penny's graph in the middle (the nodes of Ancung's app live view, PR #154) and 64 other Minds packed around it (gravity pulls every Mind to the middle, so the graphs sit close together in one disc), each a hub with a few skills and many small bubbles (seeded, so the page is the same every time; a few are big dandelions). Every Mind is drawn as in Ancung's app: its profile picture in a circle with a light ring (the three character images, in turn). The other nodes are one tone, the brand's lime: skills bright, small bubbles darker olive, lines faint lime; white marks what is lit (Penny's run, and the bubble under the cursor or picked, with its links, while the rest keeps 80% of its opacity, `DIM`); amber only while Penny waits on the owner. Labels fade in with zoom (Minds first, then skills; Penny's early). Physics is one world for every node, written here (Ancung's force layout is all-pairs and too slow for ~3,000 nodes): springs along the links, a soft push between neighbours (stronger between different Minds) and collisions, found on a grid; every Mind is pulled gently to the middle. Dragging a bubble warms it up, so its graph follows and other Minds' bubbles get pushed aside, like Obsidian. A click on a bubble opens a small card beside it (dark glass, follows the bubble): what it is (Mind, skill, tool or memory, and whose) and one line on what it does (`ABOUT`); a click on the background, the same bubble, × or Esc closes it. Drag the background to pan; pinch on a trackpad or Ctrl/⌘ + scroll to zoom (plain scroll still scrolls the page; touch scrolls the page), or the − / + / Reset buttons. Under the graph the night goes on a little (96 to 128 px), and the next section overlaps it: the demo sits on a light sheet with big rounded top corners (40 px, 72 px on desktop), pulled up 64 / 96 px over the night (`Demo.tsx`). Penny plays a scripted run of paying the internet bill while in view, in a loop. Off-screen nodes are not drawn; quiet lines and bubbles are drawn in one path each. Reduced motion: still.

Two minutes with a Mind (`components/Demo.tsx`): the heading slides up word by word and the three steps rise in when the section comes into view. The video plays on its own, muted and looping; a click opens it full screen from the start with sound and controls, and leaving full screen mutes it and lets it loop again (iPhone: `webkitEnterFullscreen`). The video comes from `NEXT_PUBLIC_DEMO_VIDEO_URL`, default `/demo/demo.mp4`; `public/demo/` is gitignored because the video is large, so host it (or add it on purpose). Without it, a placeholder shows. Reduced motion: no autoplay, no slide-ups.

Ready to meet your Mind? (`components/Cta.tsx`): no card, straight on the page, about 86vh tall on desktop. The copy and two buttons (Meet your Mind to `#minds`, View on GitHub; side by side and the same width on every screen, `.cta-btns`) on the left; on the right a big Mind flies in from the screen's right edge on a rocket-fire trail (`public/scenes/cta-flying.webp`, 1536 px with alpha, 155 KB; generated, master in `design/hellonear-assets/sections/cta-flying.png`), its flames running off the edge, with a soft shadow under it. In view: the heading slides up word by word, the rest rises in, the Mind flies in (`.cta-fly-in`) and then hovers (`.float-idle`). Phones: the Mind sits under the copy, bleeding off the right edge. Reduced motion: no motion.

Footer (`components/Footer.tsx`): a meadow with rolling hills and the Mind sitting in the middle, facing you (`public/scenes/footer-meadow.webp`, 3200 x 1074 with alpha, 470 KB; generated, upscaled 4x with Real-ESRGAN, then the sky cut out by growing the pale/blue sky region down from the top edge, so the hills rise straight from the page; master `design/hellonear-assets/sections/footer-meadow.png`). Desktop: a big logo (white, `.footer-logo`, 56 to 92 px tall), one line and three link columns (Product, Project, Built on) sit on the grass near the screen edges (4vw in from each side, not the 1200 px column) in white with a soft shadow (`.footer-on-grass`), over a shade on the grass (darker at the sides and the bottom, clear around the Mind and the hills) so the text reads; the copyright is at the bottom centre. Phones: the logo and links sit on the page above the meadow. No made-up social accounts.

## Responsive (10 Nov)

Checked at 360, 390, 768, 1024, 1280, 1440, 1920 and 2560 px wide (Playwright, every section), no sideways scroll at any of them. The desktop layout starts at **1024 px** (Tailwind `lg`), not 768: below it the hero is the phone hero, the approvals section is copy then a plain card (`ApprovalVisual`: Penny's message and the approval card on light glass, `.glass-lite`, over a patch of the lawn, `.lawn-box`, `public/scenes/lawn-card.webp` 76 KB; no pin, no photo track, no clouds) with the separate Tricked section (its inner boxes use the same lawn and light glass), the Mind Graph section keeps its own title, the Minds cards are one centred column, the CTA stacks the Mind under the copy, and the footer text sits above the meadow. From 1024 to 1439 px the hero's 1440 px stage slides left only as far as keeps the copy 40 px in (the Mind is cut by the right edge). The hero's two buttons stay side by side and the same width on every phone (smaller text and dot under 380 px), and "Works with" is one line. Under 420 px the nav logo and Open app get smaller. Under 900 px the nav has no middle links, so its grid is two columns (logo left, Open app right).


Measured on the production build (`bun run build && bun x next start`), Chrome at 1512 x 805: the longest task at load went from 1.9 s to about 60 ms, the first load from 5.2 MB to 4.4 MB (desktop) and 2.1 MB on phones, no long tasks while scrolling. Keep it that way:
- three.js and the 3D Mind load on their own (`next/dynamic` in `Hero.tsx`), only on screens wide enough for them; phones never fetch them.
- The Mind Graph builds its world only when the section is within about 1.5 screens, and settles its layout a few ticks per frame (never one long freeze); 30 Minds instead of 64 on phones and machines with 4 cores or fewer.
- Big images come in two sizes with `srcSet` (1x / 2x): the approval scene 2560 / 4096 px, the footer 1600 / 3200 px. Images below the first screen are `loading="lazy"`.
- Logos stay small (OutLayer is a 64 px tall WebP, 12 KB).
- Phones: no `backdrop-filter` (the light glass is translucent white); the hero slope is a 1500 px copy (157 KB); the Mind Graph has 18 Minds, a 1.5 device-pixel canvas and draws every other frame unless touched; the demo video loads nothing until it is on screen and pauses when scrolled past. iPhone 13 emulation with a 4x slower CPU: 566 KB first load, no long tasks while scrolling, the graph at 60 fps.
- Mind Graph on touch screens: a tap opens a card and anything else scrolls the page; "Explore" turns on dragging bubbles and the view with one finger and pinch-zoom with two (`touch-action: none`), until "Done" or the section leaves the screen.

## Copy guidelines

- Problem: AI agents that hold money have no limits you can trust. Solution: a Mind whose wallet limits are stored on-chain and enforced in a TEE, with private, verifiable AI.
- Never claim "rejected on-chain"; say "policy stored on-chain, enforced in a TEE before signing".
- Only call inference "private" for NEAR AI Confidential TEE models.
- Money claims follow the #55 decisions: every payment asks the owner first; the per-payment limit and the address list are hard stops; there is no daily limit and no per-skill wallet (one wallet per Mind).
- Connected apps on the page: Gmail, Meteor Wallet and Google Calendar. Calendar is in the final product (#57: backend merged in #62, engine tools in #65); if #65 does not merge before submission, put "soon" back. Brand icons are in `public/brands/` (Gmail from the design file, Meteor and Calendar from their own sites).
- Do not copy another product's characters, names, or visual style.
- English only.
