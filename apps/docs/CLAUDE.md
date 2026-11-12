# CLAUDE.md — apps/docs

The docs site, **docs.hellonear.xyz**, and the Trust Center, **trust.hellonear.xyz**: one Next.js app, one Vercel project (`hellonear-docs`). Built 13 Nov 2026. Owner: Axel. Root rules in `/CLAUDE.md` also apply.

**Update this file in the same PR whenever you change setup, commands, routes, content rules or where it is deployed.**

## How it works

- **One source:** every page is a Markdown file in `content/` (frontmatter `title`, `description`). `scripts/build-content.mjs` turns them into `lib/generated/pages.json` (gitignored; runs before `dev`, `build`, `typecheck` and `test`) and copies `../../docs/openapi.json` to `public/openapi.json` (gitignored). The HTML pages, the `.md` export, `/llms.txt`, `/llms-full.txt` and the MCP tools all read that JSON, so nothing reads files at request time. The build fails on an en or em dash.
- **Content is true to the repo.** Most pages were sliced from `README.md` and `docs/api-contract.md` §3 on 13 Nov (README images stripped, relative links pointed at GitHub); they do not update by themselves, so change the page when the README section changes. Never invent features, numbers or claims; link proof (tx, report, file) where you can.
- **Sidebar order** is `lib/nav.ts`. A test fails if a page in `content/` is missing from it or listed twice; the trust pages are the `TRUST_TABS`.
- **Routes:** `app/(docs)/[[...slug]]` (docs pages; `api-reference` adds Swagger UI from `/openapi.json`, client-only), `app/trust` (Trust Center: Overview, `resources`, `subprocessors`, `faq`, `updates`, each built from its Markdown by heading: `###` sections become cards, FAQ `##` categories and `###` questions become `<details>`), `app/md/[[...slug]]` (Markdown), `app/llms.txt`, `app/llms-full.txt`, `app/skill.md` (`lib/skill.ts`, an Agent Skill), `app/mcp` and `app/.well-known/mcp`.
- **`proxy.ts`** (Next 16's middleware): `/<path>.md` and requests that prefer `Accept: text/markdown` are served from `/md/<path>`; on a `trust.*` host, `/`, `/resources`, `/subprocessors`, `/faq` and `/updates` are served from `/trust/...`. `next.config.ts` adds `Link: </llms.txt>; rel="llms-txt"` to every response.
- **MCP** (`lib/mcp.ts`): stateless Streamable HTTP, one JSON-RPC message per POST, JSON answers, no sessions. `initialize`, `ping`, `tools/list`, `tools/call` with `search_docs` (`search()` in `lib/content.ts`: keyword scoring, title > description > body) and `read_page`. Read-only, CORS `*`; GET answers 405.
- **Trust Center rules (Axel, 13 Nov):** no compliance badges or certifications (HelloNear has none), no "audit" as a claim, no team members' names, no emoji. Every "Yes" in the scope table links to its proof; "N/A" where a control does not apply. Updates only for what git log or the README proves.
- Styles: plain CSS (`app/globals.css`) with the web app's Stone & Lime tokens, light and dark by `prefers-color-scheme`. Sidebar on desktop, a `<details>` menu on phones (no JavaScript needed), 16px gutters, no horizontal scroll (checked at 390 px).

## Commands

```sh
bun install
bun run dev          # http://localhost:3300
bun run typecheck
bun run test         # node:test: content, nav, links, llms, search, markdown, proxy, MCP
bun run build
```

Try the MCP server locally:

```sh
curl -s localhost:3300/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_docs","arguments":{"query":"daily limit"}}}'
```

## Deploy

Not deployed yet. Plan: **Vercel**, by Axel with the Vercel CLI from this folder (`vercel` then `vercel --prod`), project `hellonear-docs`, root directory `apps/docs`. Then two domains on that project, `docs.hellonear.xyz` and `trust.hellonear.xyz`, each a `CNAME → cname.vercel-dns.com` in the `hellonear.xyz` Cloudflare zone (DNS only, not proxied). The DNS change is on the box owner's side (James), with Axel's approval. No env vars.
