# CLAUDE.md — apps/status

The public status page, **status.hellonear.xyz**: whether HelloNear and the services it runs on answer (NEAR AI Cloud chat and embeddings, NEAR Intents 1Click quotes, OutLayer, NEAR RPC, NEAR AI Agent Market, Phala TEE Explorer). Built 13 Nov 2026 after two outages from outside our code in one night (NEAR AI embeddings hung, 1Click quotes timed out). Owner: Axel. Root rules in `/CLAUDE.md` also apply.

**Update this file in the same PR whenever you change setup, commands, env vars, the data contract or where it is deployed.**

## How it works

- The **backend** probes every service every 5 minutes, keeps 8 days of results and serves them at `GET https://api.hellonear.xyz/v1/status` (public, CORS `*`, cached 30 s; contract in `docs/api-contract.md` and `lib/status.ts`). This app only reads that.
- One server-rendered page (`app/page.tsx`), revalidated every 30 s (`revalidate`), so it works without JavaScript. A small client component (`AutoRefresh.tsx`) refreshes it every minute while the tab is visible.
- If the status API can't be read, the page says so ("Can't reach the status API"); it never shows everything as down.
- 48 bars of 30 minutes (the last 24 h), each the worst check in it; uptime counts slow answers as up. A down service shows its `impact` line (what users see); a slow one says it still works.
- **Hover a bar** for its half hour: time range, state, about how long it was bad (`bad` checks × 5 min), the last problem's detail and how many checks ran (optional bucket fields `checks`, `bad`, `detail`). CSS only; hidden on touch screens. Times are UTC everywhere, said so on the page, since it is rendered on the server.
- **Past incidents:** the backend's `incidents` (runs of failed checks of one service, last 7 days) listed by UTC day like status.claude.com, Ongoing or Resolved with the duration; a quiet day reads "No incidents reported."
- Styles: plain CSS (`app/globals.css`) with the web app's Stone & Lime tokens, light and dark by `prefers-color-scheme`. Icons are the landing's.

## Commands

```sh
bun install
bun run dev                      # http://localhost:3200, reads STATUS_API_URL
STATUS_FIXTURE=1 bun run dev     # sample data (the 13 Nov outages), no backend needed
bun run typecheck
bun run test                     # node:test, lib/ only
bun run build
```

## Env

- `STATUS_API_URL`: where `/v1/status` lives. Default `https://api.hellonear.xyz/v1/status`; for a local backend `http://localhost:4000/v1/status`.
- `STATUS_FIXTURE=1`: use `lib/fixture.ts` instead of the API (local work only).

## Deploy

Not on the Proxmox box: on **Vercel**, deployed by Axel with the Vercel CLI from this folder (`vercel` then `vercel --prod`), root directory `apps/status`. Then the subdomain: a `CNAME status → cname.vercel-dns.com` in the `hellonear.xyz` Cloudflare zone (DNS only, not proxied) and the domain added to the Vercel project. That DNS change is on the box owner's side (James), with Axel's approval.
