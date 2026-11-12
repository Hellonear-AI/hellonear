# CLAUDE.md — apps/trust

The Trust Center, **trust.hellonear.xyz**: what protects a HelloNear user's data and funds, with a link to check each claim. Its own Next.js app since 13 Nov 2026 (before that it lived inside `apps/docs`). Owner: Axel. Root rules in `/CLAUDE.md` also apply.

**Update this file in the same PR whenever you change setup, commands, routes, content rules or where it is deployed.**

## How it works

- **One source:** each tab is a Markdown file in `content/` (frontmatter `title`, `description`): `index.md` (Overview), `resources.md`, `subprocessors.md`, `faq.md`, `updates.md`. `scripts/build-content.mjs` turns them into `lib/generated/pages.json` (gitignored, the folder is made on a fresh checkout; runs before `dev`, `build`, `typecheck` and `test`). The build fails on an en or em dash.
- **Routes:** `/` (Overview: intro, scope and controls table, controls cards, subprocessors and the 3 newest updates), `/resources`, `/subprocessors`, `/faq`, `/updates` (`app/[section]`), each built from its Markdown by heading: `###` sections become cards, FAQ `##` categories and `###` questions become `<details>` with Expand all / Collapse all. Tabs are `lib/tabs.ts`; a test fails if a page is missing from them or listed twice.
- **For agents:** `/llms.txt`, and every page as Markdown at `/<path>.md` (or with `Accept: text/markdown`), served from `app/md` through `proxy.ts` (Next 16's middleware). `next.config.ts` adds `Link: </llms.txt>; rel="llms-txt"`.
- **Links:** product pages point at the docs, `https://docs.hellonear.xyz/<page>` (Mintlify, `apps/docs`); keep those slugs in step with `apps/docs/docs.json`. Proof links go to GitHub, NearBlocks, SourceScan or the TEE Explorer. A test fails on any link that is neither a full URL nor a trust page.
- **Rules (Axel, 13 Nov):** no compliance badges or certifications (HelloNear has none), no "audit" as a claim, no team members' names, no emoji. Every "Yes" in the scope table links to its proof (a test checks it); "N/A" where a control does not apply. Updates only for what git log or the README proves. The repo is public but all rights reserved, so the column says "Source public", never "open source".
- Styles: plain CSS (`app/globals.css`) with the web app's Stone & Lime tokens, light and dark by `prefers-color-scheme`, 16px gutters, no horizontal scroll at phone width.

## Commands

```sh
bun install
bun run dev          # http://localhost:3400
bun run typecheck
bun run test         # node:test: tabs, content rules, links, Yes has proof, llms.txt, markdown, proxy
bun run build
```

## Deploy

On **Vercel**, project `hellonear-trust` (created 13 Nov; `vercel.json` sets the Next.js framework, since a project made with `vercel project add` has no preset and the build looks for `public/`), deployed by Axel with the Vercel CLI from this folder: `vercel build --prod`, then `vercel deploy --prebuilt --prod`. Domain on the project: `trust.hellonear.xyz`, a `CNAME trust → 0d1d4df456d2b41a.vercel-dns-017.com` in the `hellonear.xyz` Cloudflare zone (DNS only, not proxied); the DNS change is on the box owner's side (James), with Axel's approval. No env vars. CI: `.github/workflows/trust.yml`.
