# @hellonear/fe

HelloNear web app (Next.js App Router + NEAR Connect, testnet).

**Owner:** Ancung · Issue: #9 · Design from Nabil (#10) · Context: `research.md` 5.7, 8.1, 9.2 (Mind Graph).

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

Scaffolded with `create-near-app` 10.0.0. The `hello-near` demo route, Bootstrap, and the template wallet provider are still in place and get replaced in #9.
