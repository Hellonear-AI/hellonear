# @hellonear/fe

HelloNear web app (Next.js App Router, Tailwind + shadcn/ui, NEAR Connect on testnet).

**Owner:** Ancung · Issue: #9 · Design from Nabil (#10). Plan and decisions: #3, #4; Mind Graph events in `docs/api-contract.md` §4.

## Run

Requires Node 22.22.2+ (or 24+) and Bun.

```sh
bun install
bun run dev        # http://localhost:3000
```

Checks: `bun run typecheck`, `bun run lint`, `bun run build`.

## Structure

```
app/                     routes only
src/
  components/ui|elements|layout
  modules/<feature>/     components/, hooks/, data/  (minds, chat, bazaar, wallet, graph)
  hooks/ lib/ providers/ styles/ types/
tests/
```

Details and conventions: [`CLAUDE.md`](./CLAUDE.md).

Scaffolded with `create-near-app` 10.0.0, then moved to Tailwind + shadcn/ui and `near-connect-hooks`.
