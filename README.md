# HelloNear

> Status: in development for NEAR HACKATHON (1–14 Nov 2026). This README will be rewritten for judges before submission.

An AI agent persona ("Mind") platform on NEAR: each Mind has an identity, memory, equippable skills, and a wallet whose spending limits are enforced outside the AI's reach.

## Repo layout

| Folder | What | Owner | Issues |
|---|---|---|---|
| `apps/fe` | Web app (Next.js, NEAR Connect) | Ancung | #9 |
| `apps/landing` | Landing page | Nabil | #10 |
| `apps/be` | Backend API, Postgres + pgvector, NEP-413 login | James | #8 |
| `engine` | AI engine (Mastra, NEAR AI Cloud) | Axel | #5, #11 |
| `sc` | Mind registry contract (Rust `near-sdk`) | Axel | #12 |
| `docs` | API contract and technical docs | James + Axel | #7 |
| `design` | Design tokens, screens, Mind characters (pen.dev) | Nabil | #10 |
| `research.md` | Research notes (draft, Indonesian) | everyone | — |

Plan: #3. Decisions: #4. Guidance for AI coding agents: `CLAUDE.md` (root and per folder).

## Setup (required)

Every member installs the NEAR agent skills, the NEAR Intents Agent API plugin, and the Mastra skill before starting any issue: see #23. Claude Code is told to check for them (root `CLAUDE.md`).

## Working rules

- No push to `main`, merge, deploy, PR, or submission without Axel's approval.
- Local integration and load tests before every push/merge; results reported in the PR.
- Secrets only in `.env` (gitignored). Variable names are in each folder's `.env.example`.
- When you change how a folder works, update its `CLAUDE.md` in the same PR.
