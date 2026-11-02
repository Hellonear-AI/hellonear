# CLAUDE.md — HelloNear (repo root)

Guidance for AI coding agents (Claude Code, Codex, Cursor, …) working in this repo. Each folder has its own `CLAUDE.md` with folder-specific rules; read the one for the folder you are changing before you start.

## Keep these files current

**When you change how a folder works (setup, commands, structure, env vars, conventions, a decision), update that folder's `CLAUDE.md` in the same PR.** Update this root file when the change affects the whole repo. A PR that changes behaviour but leaves the relevant `CLAUDE.md` stale is not done.

## Required skills (check first, every session)

Before writing code or answering NEAR/Mastra questions, check that these skills are available to you:

- the 8 NEAR skills from `near/agent-skills`: `near-ai-cloud`, `near-api-js`, `near-kit`, `near-dapp`, `near-intents`, `near-smart-contracts`, `near-contract-audit`, `near-cli-rs`;
- `near-intents-agent-api` (Claude Code plugin from `NEAR-Intents-Agent-API/skills`);
- `mastra` (from `mastra-ai/skills`).

If any are missing, **stop and tell the user to install them before continuing**, pointing to issue #23 with these commands:

```sh
npx skills add near/agent-skills -g -a claude-code -s '*' -y
npx skills add mastra-ai/skills -g -a claude-code -s mastra -y
```
```text
/plugin marketplace add NEAR-Intents-Agent-API/skills
/plugin install near-intents-agent-api@near-intents-agent-api
```

`.claude/settings.json` already registers the NEAR Intents marketplace and enables the plugin for anyone who trusts this folder, so in Claude Code the plugin may only need `/reload-plugins`. The `npx skills` commands are still required.

When they are installed, use the relevant skill for every NEAR or Mastra task instead of relying on memory.

## What this is

HelloNear is an AI agent persona platform on NEAR, built for NEAR HACKATHON (1–14 Nov 2026, deadline 14 Nov 23:59 UTC). Users pick a "Mind" template (General Assistant, Payments Mind, Email Manager), and each Mind has a persona, memory, equippable skills, and a NEAR wallet whose spending limits are enforced outside the AI's reach.

- Research and decisions: `research.md` (Indonesian, draft) and issues #3 (plan) and #4 (decisions).
- Language: everything written to GitHub and to the repo (code, comments, docs, issues, PRs, commits) is in **English**. `research.md` stays in Indonesian until the team decides otherwise.

## Layout

| Folder | What | Owner |
|---|---|---|
| `apps/fe` | Web app (Next.js App Router, NEAR Connect) | Ancung |
| `apps/landing` | Landing page | Nabil |
| `apps/be` | Backend API, Postgres + pgvector, NEP-413 login, OutLayer + Composio | James |
| `engine` | AI engine (Mastra + NEAR AI Cloud) | Axel |
| `sc` | Mind registry contract (Rust `near-sdk`) | Axel |
| `docs` | Shared technical docs, incl. `api-contract.md` | James + Axel |

## Decided stack (see #4)

- Network: **testnet only**. NEAR Intents / 1Click has no testnet and was down on 2 Nov; do not build core features on it.
- Wallet: **OutLayer** on testnet (per-skill sub-wallets, per-transaction policy, multisig, freeze). Policy is **stored on-chain and enforced in a TEE before signing**; never claim "rejected on-chain" or show a tx link for a rejected transfer.
- User/owner wallet: **Meteor Wallet** (testnet) is the team's primary wallet. Every flow is tested with it and it is shown first in NEAR Connect; other NEAR Connect wallets stay available. Meteor signs login (NEP-413), policy changes, approvals and freeze; OutLayer is the Mind's own wallet.
- LLM: NEAR AI Cloud through Mastra; tool calling is proven (#5). Build chat models with `@ai-sdk/openai-compatible` + `includeUsage: true` so streaming reports token usage (details in `engine/CLAUDE.md`). Only verifiable (Confidential / 3P TEE) models get a badge, at the level the NEAR AI SDK proves: `model_tee` or `gateway_tee` (streaming); Incognito models never (#19).

## Local machines

The team uses macOS with **OrbStack** as the Docker runtime. Keep local services light: `docker-compose.yml` caps Postgres at 1 CPU / 512 MB, run tests sequentially, keep load tests short, and `docker compose stop` when you are done.

## Deployed on testnet

| What | Account | Env |
|---|---|---|
| Mind registry contract (`sc/`), v0.2.0 | `hellonear-registry.testnet` | `REGISTRY_CONTRACT_ID`, `NEAR_NETWORK=testnet` |

Keep this table and each folder's `.env.example` in sync when something is (re)deployed.

## Rules (non-negotiable)

1. **Use data, not assumptions.** Claims like "safe", "done", or "X causes Y" must be backed by something seen in this session (test output, logs, responses, diffs). Otherwise write "not proven yet". Do not act on an unproven cause.
2. **Integration + load tests locally before every push/merge**, reported in the PR. Tests that cannot run are reported as not run, with the reason.
3. **No push to `main`, merge, deploy, PR, or submission without Axel's approval — every time.** Approval for one action does not cover the next.
4. **Secrets only in `.env`** (gitignored). Each folder has a `.env.example` with names only. Never paste secrets into code, issues, PRs, logs, or prompts.
5. **Verify NEAR facts before relying on them.** Use the official NEAR agent skills (`npx skills add near/agent-skills`) and live docs (docs.near.org, docs.near.ai, docs.near-intents.org). If a skill and the live docs disagree, follow the docs. Pin package versions; do not upgrade during the hackathon.
6. **Read websites properly.** Do not conclude a site is empty from a plain fetch (many are JS-rendered); use `curl -s "https://r.jina.ai/<url>"`, the site's `llms.txt`/`.md` pages, or a browser.

## Commits

- **Small commits, one logical step each** (e.g. refactor, then feature, then tests, then docs), so humans and AI agents can follow the history and review or revert one step at a time. Each commit must build and pass its tests.
- Conventional prefixes: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, with a scope (`feat(engine): …`, `test(sc): …`).
- The body says why, and which tests ran with their results.

## Hackathon submission rules (summary; re-read https://nearhackathon.com/HACKATHON.md before submitting)

- Repo must be public before 14 Nov 23:59 UTC. One submission per project, not editable.
- X post tags **@NEARProtocol** and **#NEARHackathon**; a video is required if the demo only runs locally.
- The root `README.md` must be machine-readable for AI judges: what it is, the problem, and "do X, see Y" steps. No marketing.
- A human builds and approves the submission payload; agents never invent names, accounts, or emails.
