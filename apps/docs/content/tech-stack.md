---
title: Tech stack
description: What is used where: NEAR, NEAR AI Cloud, NEAR Intents, OutLayer, Mastra and the rest.
---

| | Technology | Where in the repo | What it does in HelloNear |
|---|---|---|---|
|  | **NEAR Protocol** (testnet) | `sc/`, `apps/be/src/auth.ts`, `apps/be/src/wallets.ts` | The Mind registry contract (Minds, published skills, `equip_skill` pays the publisher); NEP-413 sign-in; every payment, policy change and freeze is a NEAR transaction |
|  | **NEAR AI Cloud** | `engine/src/models.ts`, `engine/src/verify.ts`, `engine/src/titles.ts` | Runs every model call inside a TEE; HelloNear checks each reply's signature against the attestation before the Verified badge, and keeps the proof |
| | **NEAR Intents** (1Click API + official SDK) | `engine/src/crosschain.ts` | Cross-chain USDC/USDT quotes from NEAR to other chains; each quote's 1Click signature is verified with `verifyQuoteSignature` |
|  | **NEAR AI Agent Market** ([market.near.ai](https://market.near.ai)) | `engine/src/market.ts`, skill `agent-market` | Searches the public catalog of agents and gets a job's exact price from the agent's own x402 answer (A2A, unpaid), then picks the cheapest within the owner's budget; hiring is paid in USDC on mainnet, so it only quotes for now |
| | **Swarm auction contract** (`near-sdk`, testnet) | `sc/swarm` | Sealed-bid group buying between agents, each its own sub-account; deployed at `auction.hellonear-swarm.testnet`, source verified |
|  | **OutLayer** (testnet) | `apps/be/src/wallets.ts`, `apps/be/src/payments.ts` | One wallet per Mind; its policy (per-payment limit, daily limit, allowed recipients) is stored on chain and checked in a TEE before anything is signed; freeze |
|  | **Meteor Wallet** via **NEAR Connect** | `apps/fe` | The owner's wallet: signs in, signs the Mind wallet's policy, adds funds, freezes. Other NEAR Connect wallets work too |
| | **FastNear** testnet RPC | `engine/src/tools.ts`, `apps/be/src/config.ts` | Account lookups before a payment (`view_account`) and transfer checks after one (`tx`) |
| | **Phala TEE Attestation Explorer** | `apps/be/src/teeExplorer.ts` | Checks the Intel TDX quote behind a reply; the app opens its VERIFIED report |
|  | **Mastra** 1.81 | `engine/` | The agent: one generic Mind agent, tools, approvals (`requireApproval`, per-call rules, `beforeApproval`), memory, context limits, dynamic workflows for the Builder, workflow schedules for Autopilot |
|  | **GLM-5.3 Flash** (Z.ai), **DeepSeek V4.1 Flash**, **Qwen3 Embedding** | `engine/src/config.ts`, `engine/src/models.ts` | Chat, reasoning and memory embeddings, all served by NEAR AI Cloud |
|  | **Composio** | `apps/be/src/connections.ts`, `engine/src/composio.ts`, `engine/src/apps.ts`, `engine/src/calendar.ts`, `engine/src/zoom.ts` | The owner connects Gmail, Google Calendar, Meet, Sheets, Drive, Docs, Notion, Slack, Outlook and Zoom with OAuth (backend: Connect Links); the engine runs the app tools in a session scoped to that one owner |
|  | **AgentMail** | `apps/be/src/mail.ts`, `engine/src/mail.ts` | Each Mind's own email address (`…@agentmail.to`): send after approval, read its inbox with spam and phishing warnings, email the owner |
|  | **Telegram Bot API** | `apps/be/src/telegram.ts`, `apps/be/src/telegramFormat.ts` | A bot per Mind: chat, streamed replies, Approve / Decline buttons; only the owner's chat is answered |
| | **Postgres 17 + pgvector** | `apps/be/migrations/`, `engine/src/mastra.ts` | Runs, events, approvals, encrypted secrets (backend); Mastra storage, run snapshots and memory vectors (engine) |
| | **Next.js 16, React 19, GSAP, React Flow** | `apps/fe`, `apps/landing` | The web app (chat, live view, Builder canvas, wallet, settings) and the landing page |
| | **Rust, `near-sdk` 5.29, `near-sandbox`** | `sc/` | The registry contract and its sandbox tests, including upgrades |
| | **Bun, Node 24, k6** | every package | Package manager and runtime; load tests |
| | **Proxmox LXC + Cloudflare Tunnel** | `deploy/` | The hosted demo; a merged `main` is deployed automatically after its CI passes |

---

## How NEAR is used

| What | Where | Proof |
|---|---|---|
| **NEAR AI Cloud**: every model call runs in a TEE; each reply is checked against the attestation and marked verified | `engine/src/models.ts`, `engine/src/verify.ts` | `run.verified` event, `engine/test/verify.test.ts`, the TEE Explorer report above |
| **The proof behind the badge**: signatures and Intel's TDX report kept and shown under View proof; the backend uploads the Intel quote to Phala's TEE Attestation Explorer and the app opens the verified report | `engine/src/verify.ts`, `apps/be/src/teeExplorer.ts`, `apps/fe/src/modules/runs/components/ProofDialog.tsx` | `GET /v1/runs/{runId}/proof`, `POST /v1/runs/{runId}/proof/tee-explorer` |
| **NEAR Intents (1Click API)**: cross-chain stablecoin quotes, each signed by 1Click and checked with the official SDK | `engine/src/crosschain.ts` | `engine/test/crosschain.test.ts`, the live quotes above |
| **OutLayer wallets** on testnet: one per Mind, policy v2 (per-payment limit, daily limit, recipients) enforced in a TEE; policy and freeze are calls on `outlayer.testnet` the owner signs | `apps/be/src/wallets.ts` | the payment, policy and freeze transactions above |
| **NEP-413 sign-in** with the owner's NEAR wallet (Meteor first, any NEAR Connect wallet works) | `apps/be/src/auth.ts` | `apps/be/test/api.test.ts` |
| **Mind registry contract** (Rust, `near-sdk` 5.29) on `hellonear-registry.testnet`: Minds, published skills, and `equip_skill` pays the skill's publisher | `sc/` | `sc/README.md` (deploy transactions, code hash), sandbox tests in `sc/tests/` |
| **Swarm auction contract** (Rust, `near-sdk` 5.29) on `auction.hellonear-swarm.testnet`: sealed-bid group buying, every agent its own sub-account, source verified | `sc/swarm` | [a real round's transactions](/contracts#the-swarm-auction-one-real-round-on-testnet), `sc/swarm/tests/simulation.rs` |
| **Meta transactions (NEP-366)**: a relayer pays the gas for an owner's calls to the registry, never a deposit | `apps/be/src/relay.ts` | `apps/be/test/relay.test.ts` |
| **NEAR AI Agent Market**: agents from market.near.ai, priced through their x402 answer (paid with a NEP-366 USDC transfer on mainnet, so quoted only here) | `engine/src/market.ts` | `engine/test/market.test.ts`, Try it step 8 |
| **NEAR RPC** (FastNear testnet): account lookups (including whether the account is a contract) and transfer checks the Mind uses before and after paying | `engine/src/tools.ts` | `engine/test/near-tool.test.ts` |

---
