# HelloNear — Research Notes (DRAFT)

> **Status: DRAFT, not final.** This document is brainstorming material for the team (Ancung, Nabil, Axel, James).
> Every recommendation here is a proposal and may change after discussion.
> Research done on 25 Oct 2026. Package versions, prices, and product status may change; re-check before relying on them.

## Contents

1. [Summary](#1-summary)
2. [NEAR HACKATHON: facts and rules](#2-near-hackathon-facts-and-rules)
3. [HelloMinds: what we are modelling](#3-hellominds-what-we-are-modelling)
4. [HelloMinds gaps NEAR can fill](#4-hellominds-gaps-near-can-fill)
5. [NEAR ecosystem for agents](#5-near-ecosystem-for-agents)
6. [Official github.com/near repos and Agent Skills](#6-official-githubcomnear-repos-and-agent-skills)
7. [AI engine options](#7-ai-engine-options)
8. [Proposed architecture](#8-proposed-architecture)
9. [Proposed team split and timeline](#9-proposed-team-split-and-timeline)
10. [Unproven, must test](#10-unproven-must-test)
11. [Open questions for the team](#11-open-questions-for-the-team)
12. [Sources](#12-sources)

Claim status legend:

- **[V]** verified: the source was read directly during research (via r.jina.ai, raw docs markdown, `gh api`, `npm view`, or crates.io).
- **[UV]** unverified: from third-party articles, prior knowledge, or pages that could not be fully read.

---

## 1. Summary

**Idea:** an AI agent persona platform in the style of [HelloMinds](https://www.hellominds.ai/). A user picks or creates a "Mind" (Sales, Trader, General Assistant, Email Manager, Game Designer, and so on). Each Mind has an identity, memory, skills equipped from a marketplace, app connections, and **a wallet on NEAR**.

**Working pitch (draft):**

> HelloMinds, but the guardrails are enforced on-chain, the wallet is non-custodial, and the thinking is private and provable.

**Proposed stack (not final):**

| Layer | Proposal | Short reason |
|---|---|---|
| AI engine | **Mastra** (TypeScript) | Per-Mind dynamic agents, `SKILL.md` skills, memory, scheduler, multi-agent, and custom model baseURL in one Apache-2.0 package |
| n8n-style workflows | **Not used in the product** | The Sustainable Use license does not cover a multi-tenant product, and Mastra already covers the features |
| App integrations | **Composio** | Managed OAuth for Gmail/Calendar/Drive and more; HelloMinds also uses Composio |
| LLM | **NEAR AI Cloud** | Private inference in a TEE, OpenAI-compatible, verifiable |
| Per-Mind wallet | **OutLayer** | Keys in a TEE via MPC, on-chain spending policy, approvals, freeze |
| On-chain identity | Small registry contract (Rust `near-sdk`) | Mind ↔ owner ↔ wallet ↔ skills |
| Agent economy | **NEAR AI Agent Market** (x402 USDC) | Minds can take jobs and get paid |
| Frontend | Next.js + `@hot-labs/near-connect` | What the NEAR docs currently recommend |

**Candidate tracks:** `agents` (primary), `security`, `privacy`, `swarms`.

---

## 2. NEAR HACKATHON: facts and rules

Source: https://nearhackathon.com/HACKATHON.md **[V]**. Re-read before submitting, as the rules may change.

### Schedule (UTC)

| Phase | Time |
|---|---|
| Start | 2026-11-01 00:00 |
| **Development ends = submission deadline** | **2026-11-14 23:59** |
| Judging | starts 2026-11-16 |
| Results | by 2026-11-18 23:59 |

### Requirements

- No up-front registration. The only form is the final submission.
- **The repo must be public** before the deadline. It may stay private during development.
- **A demo post on X** saying the project was built at NEAR HACKATHON, with a video or screenshots attached. Written and posted by the team.
- **One submission per team**, not editable, via `POST https://nearhackathon.com/api/applications` or the form at https://nearhackathon.com/#apply. Project name and email must be unique.
- Submission fields: `projectName`, `leadName`, `email`, `size` (`2 - 4` / `4 - 6`; our team has 4 people), `tracks[]`, `nearAddress` (a **mainnet** account for the prize, created by the team), `projectUrl`, `demoUrl`, `idea` (20–2000 characters), and `consent`.
- The `website` field is a spam trap. Never fill it.
- **The jury includes AI judges.** The README must be machine-readable: what the product is, what problem it solves, and how to try it as "do X, see Y" steps. No marketing language.
- Never commit secrets.

### Relevant tracks

| id | Track | Organizer hints | Fit |
|---|---|---|---|
| `agents` | Agent Economy | agent commerce, NEAR Intents, chain signatures | **Primary**: Minds that earn, spend, and hire other agents |
| `security` | AI Security & Defense | spending limits, policy engines, sandboxed wallets, function call keys, TEE attestation | **Strong**: on-chain guardrails via OutLayer + TEE verification |
| `privacy` | Privacy & Private AI | private AI, TEE, NEAR AI Cloud | **Strong**: all inference on NEAR AI Cloud |
| `swarms` | AI Swarms | multi-agent, NEAR Intents, sub-accounts | Circles (Minds collaborating) |
| `business` | Autonomous Business | treasury, sales, procurement | Sales Mind (optional) |

Partners named by the organizers: NEAR Intents, Aurora, HOT, Rhea, meme.cooking, HEX, NEAR.AI, SVRN, Trezu, SputnikDAO, **OutLayer**, GoMining.

---

## 3. HelloMinds: what we are modelling

Sources: hellominds.ai, build.hellominds.ai (docs, guides, FAQ), and their agent markdown files at `build.hellominds.ai/agent-md/...` **[V]**. The FAQ answers were extracted from the page payload because they are hidden inside accordions.

Built by Animoca Brands. There is a Minds investment programme of up to US$10 million for teams building on Minds.

### 3.1 Core concepts

| Concept | Explanation (from their docs/FAQ) | HelloNear equivalent |
|---|---|---|
| **Mind** | A persistent, always-on agent with an identity, long-term memory, and a platform wallet. *"A chatbot is a vending machine; a Mind is a person you've hired."* | Mind record in the DB + NEAR account/wallet |
| **Steward** | The Mind's creator and owner. Cannot be removed or transferred via the UI | `owner` in the registry contract |
| **Soul** | The permanent core: Identity (DNA), Memory, State, and Wallet. Holds the Tenets | Soul builder → system prompt + config |
| **Constitution** | The technical and moral floor. Situations that conflict with the Soul are refused (invariants) | Guardrails + on-chain policy |
| **Tenet** | A permanently stored rule, value, or fact. Two kinds: **Invariant** (Guardrail, set by the Steward, unbreakable) and **Prior** (preferences the Mind learns) | `tenets` table (type: invariant/prior) |
| **Guardrail** | A Tenet marked as invariant. FAQ examples: privacy ("Never share the Steward's email"), **budget ("Never spend more than 500 Credits in a single session")**, language style | Prompt guardrail **+ enforced on-chain for money** |
| **Brain** | The LLM layer, auto-routed per task type (OpenAI, Gemini, Grok). The Soul stays intact when the model changes | Model router (NEAR AI Cloud) |
| **Memory** | Hierarchical: **RAM** (session context), **Episodes** (past sessions), **Tenets** (durable layer). There is a skill for selective forgetting | Mastra memory (history, semantic recall, working memory) |
| **Artifact** | Passive files (PDF, CSV, knowledge base) used as context | File upload + RAG |
| **Tool** | A single action, e.g. "Send Email" | Mastra tool / Composio |
| **Skill** | A multi-step playbook that sequences Tools. Made of a **Registry Offering** (listing), **App Manifest** (connections), **Tool Schemas** (allowed actions), and **Skill Playbook** (routine). One Skill can be used by many Minds. A Mind's set of skills is its "Armory" | `SKILL.md` + tool bindings |
| **Bazaar** | Marketplace of Skills and Apps. Skill creators earn when their skill is equipped. 4,000+ skills | HelloNear Bazaar (paid in NEAR/USDC) |
| **Circles** | Trust gate. Unknown Minds or people are **silently blocked** (no error). One Circle per Mind. Members are added via the dialog, email CC, or a Telegram group | ACL + multi-agent supervisor |
| **Internal Channels** | A Lead Mind delegates to Expert Minds, all spending the Steward's credits | Mastra supervisor/subagents |
| **Cognition Credits** | Cost unit for reasoning, tools, and autonomous work | Token balance in the Mind's wallet |
| **Brain Pulse** | Self-monitoring when a skill fails: retry, pivot, or explain to the user | Engine error handling + retries |
| **Built-in skills** | Mind Architect, Skill Architect, Standard Hygiene (context management), Passive Autonomous Mode (scheduled work) | Built-in skill templates |

### 3.2 How skills are built (Skill Building Guide)

Six conversational steps over Telegram or email: **Describe → Refine → Connect** (the platform stores the API key; the Mind never holds it) **→ Run → Inspect** (check access and scope) **→ Publish** to the Bazaar. Published skills are updated via `REGISTRY_Update` and `SKILL_Update`. Sessions already running keep the old version.

### 3.3 Integrations and channels

- **Live integrations:** Telegram, Gmail, Google Calendar, Discord, Slack, GitHub, Nansen, Dune, Perplexity, Spotify, Strava, and `HTTP_Execute` (call any REST endpoint).
- **Apps on the landing page:** CoinGlass, Duffel, Google Drive, OpenRouter, SerpAPI, Steam, and more.
- **Channels:** web chat, email, Telegram (the Mind becomes a bot and can message first, e.g. price alerts). AgentMail (`@agentmail.ai`) is listed as "coming soon".
- **App provider in the Bazaar:** Composio (seen in the CLI example `--provider composio`).

### 3.4 Developer surface

- **Minds CLI** (`@animocabrands/minds-cli`, Node 22+). JSON output, designed for coding agents. Commands include `minds mind awaken --id sales`, `minds circle add`, `minds bazaar search`, `minds mind skills equip`, `minds send`, `minds usage by-tool`.
- **Minds Client Library** (`@animocabrands/minds-client-lib` 0.1.7), using a Builder API key.
- **Minds Connect SDK** (`@animocabrands/minds-connect` 0.1.2), "Sign in with Minds" OAuth.
- Mind templates are activated via `--id` (e.g. `sales`).

### 3.5 Templates in the UI (from the screenshot)

General Assistant, Sales Mind, Bizz Mind, Superior Trader, Game Designer, Email Manager, and more. Each template has:

- a 3D character in a "collector series" toy-box style;
- a short description and a "Customizable" label;
- **Apps Equipped** (Sales example: Calendar, Tasks, Gmail, Drive, Sheets);
- **What it does** (example outputs);
- **Skills Equipped** (Sales example: Passive Autonomous Soul, Event and Deal Flow Scout, Sales and Negotiation);
- "Use default settings" and "Customize" buttons.

### 3.6 Case study: Superior Trade Intern

One Mind, in one session, handled two unrelated jobs: planning a Bali trip, then trading BTC overnight with the Superior Trade skill (signal, position, take-profit, +$818). The architectural lesson, in their own words: **a general-purpose Mind for context and coordination, plus specialised Skills for precise work.**

---

## 4. HelloMinds gaps NEAR can fill

Taken directly from the HelloMinds FAQ **[V]**:

| HelloMinds today | Quote or fact | Opportunity on NEAR |
|---|---|---|
| **Custodial wallet** | *"Keys are encrypted and stored in a secure database managed by the platform backend. When a sensitive operation needs to be signed, the backend decrypts and signs on the Mind's behalf."* | Keys in a TEE via MPC (OutLayer). Even the platform cannot use the key outside the policy |
| **Budget guardrail is only a prompt** | *"Budget Guardrail — 'Never spend more than 500 Credits in a single session'"* is a Tenet in the prompt | Limits **enforced on-chain** (per transaction, daily, whitelist, approval, freeze). Prompt injection cannot break them |
| **Data sent to many providers** | *"We also send your inputs to third-party AI providers (currently including OpenAI, Google, Qwen, and xAI) and infrastructure services (such as LangChain…)"* | Inference in **NEAR AI Cloud TEEs**, with attestation and per-response signatures users can verify |
| **Closed marketplace** | The Bazaar and credits only exist inside their platform | Minds can **earn on the NEAR AI Agent Market** (x402, on-chain USDC); skill payments on-chain |
| **Identity lives in the platform DB** | Minds and Stewards only exist in their system | Minds as on-chain entities (registry / sub-account), portable |

Note: HelloMinds names LangChain as part of its infrastructure. That hints at their stack; it is not a requirement for ours.

---

## 5. NEAR ecosystem for agents

### 5.1 NEAR AI Cloud — status: production → **proposal: the brain of every Mind**

- Private inference in a TEE (Intel TDX + NVIDIA confidential GPU). OpenAI-compatible gateway: `https://cloud-api.near.ai/v1`. Supports chat completions, streaming, and the Responses API (stateless). **[V]**
- 61 models at `GET https://cloud-api.near.ai/v1/model/list` **[V]**, in three tiers:
  - **Confidential TEE** (fully verifiable). Price per million tokens **[V]** (note: the docs quickstart example also uses `zai-org/GLM-5.1-FP8`):

    | Model | Input | Output | Notes |
    |---|---|---|---|
    | `z-ai/glm-5.3-flash` | $0.08 | $0.50 | 1M context; candidate for cheap everyday chat |
    | `z-ai/glm-5.3` | $1.8 | $5.75 | |
    | `Qwen/Qwen3.6-35B-A3B-FP8` | $0.17 | $1.1 | |
    | `qwen/qwen3.5-397b-a17b` | $0.5 | $3.3 | |
    | `deepseek/deepseek-v3.2` | $1.1 | $1.1 | |
    | `moonshotai/kimi-k2.6` | $0.81 | $3.85 | |
    | `moonshotai/kimi-k3` | $3.3 | $16.5 | |

    Besides chat: `Qwen3-Embedding-0.6B` embeddings, a reranker, Whisper, FLUX.2, and PII redaction.
  - **3P Confidential TEE:** models in third-party TEEs.
  - **Incognito:** Claude, GPT, and Gemini through a TEE gateway. The models themselves do **not** run in a TEE.
- **API key:** sign up at cloud.near.ai → buy Credits → create a key. **[V]**
  - **There is a credit request form for hackathon projects**, linked from https://docs.near.org/getting-started/hackathons. **Apply right away.** **[V]**
  - Another option: staking for inference, where staking rewards become credits (1 credit = 1 USD). **[V]**
- **Verification SDK:** `@nearai/inference-sdk` (npm 0.1.0, 23 Oct 2026, Node ≥24). Supports E2EE and `verifyResponse(id)` to check the signature and attestation. **[V]**
  ```js
  import { InferenceClient } from '@nearai/inference-sdk/node';
  const c = new InferenceClient({ baseUrl: 'https://cloud-api.near.ai/v1', apiKey, e2ee: true });
  const r = await c.chat.completions.create({ model: 'z-ai/glm-5.3-flash', messages });
  await c.verifyResponse(r.id);
  ```
- **Attestation:** gateway attestation, model attestation (NVIDIA NRAS), TLS binding, response signatures, and a browser Verification Center. **[V]**
- UI idea: a "Verified private" badge on each message, driven by `verifyResponse()`.
- ⚠️ **The old NEAR AI agent framework (Hub, registry, app.near.ai) is DEPRECATED.** Its servers were shut down on 31 Oct 2025. What remains is Cloud (inference) and the Agent Market. **[V]**

### 5.2 OutLayer — status: live on mainnet → **proposal: per-Mind wallet**

- Describes itself as a "secure transaction layer for AI agents". **[V]**
- Wallet keys are issued by NEAR MPC (CKD) into an Intel TDX enclave. NEAR, EVM, and Solana keys are derived inside the enclave. **The agent only receives signatures and never holds keys.** **[V]**
- **On-chain policy:** per-transaction, hourly, daily, and monthly limits; address whitelist; 2-of-3 multisig approval; `freeze_wallet()`. **[V]**
- **Connectors:** Gmail, GitHub, Mercury, Hyperliquid, Polymarket. Swaps and cross-chain via NEAR Intents. **[V]**
- **Agent wallet API** **[V]** (from `skills.outlayer.ai/agent-custody/SKILL.md`):
  ```
  POST https://testnet-api.outlayer.ai/register          -> api_key wk_..., handoff_url
  GET  /wallet/v1/balance?chain=near   (Authorization: Bearer wk_...)
  GET  /wallet/v1/address?chain=near
  POST /wallet/v1/transfer
  POST /wallet/v1/intents/swap
  POST /wallet/v1/intents/withdraw
  PUT  /wallet/v1/api-key                                 -> derived key per sub-agent
  ```
- The **sub-agent key** pattern fits "one Mind = one policy-bound wallet, owned by one user". **[V]**
- **Verifiable compute:** WASI (Rust `wasm32-wasip2`), called from a contract (`outlayer.near` / `outlayer.testnet`, yield/resume) or via HTTPS `POST https://api.outlayer.ai/call/{owner}/{project}`. **[V]**
- **Note:** swaps via Intents are mainnet-only. **[V]**
- OutLayer is an official hackathon partner.

### 5.3 NEAR Intents / 1Click API — status: production, **mainnet only**

- The user states the desired outcome and solvers execute it. 1Click is a REST API for cross-chain swaps (EVM, Solana, NEAR, TON, Stellar, Tron, BTC, and more). **No testnet.** **[V]**
- **Endpoints:** `https://1click.chaindefuser.com/v0/quote`, plus `tokens`, `status`, `submit deposit tx`, and *signed intent execution*. **[V]**
- **Auth:** a JWT from partners.near-intents.org, sent in the `X-API-Key` header. **[V]**
- **Fees** **[V]**:
  - Protocol: 0.0001%.
  - Without an API key: +25 bps.
  - With a key: 20 bps, or 1 bp for stablecoin pairs.
  - **`appFees`** lets us take our own fee, a possible business model.
- **SDKs** **[V]**: `@defuse-protocol/one-click-sdk-typescript` 0.1.26, `@defuse-protocol/intents-sdk` 0.93.0, a React swap widget.
- The verifier contract lives in `near/intents` (old name "defuse"), deployed on mainnet as `intents.near`.
- **Use for us:** the Superior Trader Mind and cross-chain payments. Easiest through OutLayer, which already wraps Intents.

### 5.4 Shade Agents — ⚠️ **DEPRECATED, do not use**

- Official docs: *"After April 19th, 2026, the Shade Agent Framework will no longer be maintained… Teams that choose to use it should plan to assume responsibility for maintenance."* **[V]**
- Architecture: agent in a TEE (Phala Cloud, Docker), an agent contract that verifies attestation, and signing via Chain Signatures. Package: `@neardefi/shade-agent-js` 2.2.0. **[V]**
- Too heavy for two weeks (Docker, Phala, Rust contract, attestation), especially with no maintenance.

### 5.5 NEAR AI Agent Market — status: live → **proposal: Minds can earn**

- https://market.near.ai: 500 agents, 717 jobs, 441 deliveries at the time of reading. **[V]**
- Flow: escrow → bid → deliver → accept, plus competitions with USDC prizes. **[V]**
- `/v1/*` API, MCP at `/mcp`, webhooks, agent tokens `aat_...`. **[V]**
- **A2A + x402 v2** (scheme `exact`). `/.well-known/x402` returns `network: "near:mainnet"` with native NEAR USDC as the asset. **[V]**
- Skills for agents: https://market.near.ai/llms.txt and https://market.near.ai/skill/flows/a2a-x402.md. **[V]**
- Launched 4 Feb 2026. The old version is still at market-legacy.near.ai. **[V]**
- **Our position:** the Agent Market is where agents get hired per job. We build persistent personas that can work there. Complementary, not a competitor.

### 5.6 NEAR account primitives

| Primitive | Fact | Use |
|---|---|---|
| **Function-call access key** | Restricted to a `receiver_id` and `method_names`, with an optional `allowance`. ⚠️ **The allowance only covers gas, and the key cannot transfer NEAR** **[V]** | **Not** a spending limit. Useful to let the backend or agent call only specific methods on our contract |
| **Gas Keys** (NEP-611, nearcore 2.13) | Keys with a prepaid gas balance and 1,024 parallel nonce lanes. The docs call them ideal for *"a fleet of agents operating one account"* **[V]** | Many Minds operating from one platform account |
| **Sub-account** (`mind.platform.near`) | Standard NEAR. Caveat: a sub-account holding only an FCK cannot be recovered without a contract method for it **[V]** | On-chain Mind identity (optional) |
| **Chain Signatures** | Contract `v1.signer` (mainnet), `sign` method with a derivation path; library `chainsig.js` 1.1.16 **[V]** | Minds holding addresses on other chains (already wrapped by OutLayer) |
| **Meta transactions** (NEP-366) | Need a self-run off-chain relayer **[V]**; public relayers **[UV]** | Gasless onboarding (optional) |
| Universal / Deterministic Accounts | Only the titles were seen in the docs llms.txt **[UV]** | Needs checking |

Conclusion: a real spending limit needs a **vault contract** (the key may only call a `spend()` method that enforces the limit) **or OutLayer policy**. Proposal: use OutLayer so we don't write custody logic ourselves.

### 5.7 JS/TS toolkit

| Need | Proposal | Notes |
|---|---|---|
| NEAR backend | `near-api-js` **7.4.0** (23 Oct 2026) **[V]** | Now a single package; `@near-js/*` is the legacy path |
| Concise alternative | `near-kit` 0.20.2 **[V]** | fetch-style API, with React hooks and sandbox |
| New alternative | `near-api-ts` / `react-near-ts` (repo `near/near-api-ts`) **[V]** | Result-based, TanStack Query; repo is still young (7 stars) |
| Frontend wallet | **`@hot-labs/near-connect`** 0.11.4 + `near-connect-hooks` **[V]** | Current docs recommendation: HOT, Meteor, Nightly, WalletConnect, and more |
| Legacy Wallet Selector | `@near-wallet-selector/core` 10.1.4 | Last updated Dec 2025; no longer used in the docs |
| Backend auth | `near-sign-verify` (NEP-413), `better-near-auth` **[V]** | Sign in with a wallet signature |
| Social login / Intear | **[UV]** | Not found on the pages read |
| Local tests | `near-sandbox` (npm, repo `near/near-sandbox-js`) **[V]** | For local integration tests |

### 5.8 Smart contracts

- **`near-sdk` (Rust) 5.29.1** and **`cargo-near` 0.22.0** (both 19 Oct 2026) **[V]**. The only official SDK.
- `near-sdk-js` is now only a "Community SDK… not covered in this documentation" (last version 2.0.0, Jun 2024) **[V]**. Do not use it.
- `create-near-app` has also dropped the TS contract template. Only Rust templates remain (auction / auction-adv) with `near-sandbox` tests. **[V]**

---

## 6. Official github.com/near repos and Agent Skills

### 6.1 `near/agent-skills` ⭐ — official skills

https://github.com/near/agent-skills (last commit 28 Sep 2026) **[V]**. Format: `SKILL.md` (Agent Skills specification).

**Already installed globally on Axel's machine** (`~/.claude/skills/near-*`) via `npx skills add near/agent-skills -g -a claude-code -s '*'`.

| Skill | Contents | Used by |
|---|---|---|
| `near-smart-contracts` | Rust near-sdk 5.x: structure, state, cross-contract calls, yield/resume, chain signatures, upgrades, integration tests | Axel (registry contract) |
| `near-contract-audit` | Contract security checklist (high/medium/low) | Axel, before submission |
| `near-ai-cloud` | OpenAI-compatible API, E2EE chat, TEE attestation verification (gateway, model, signature), embeddings/rerank/PII redaction endpoints | Axel (AI engine) |
| `near-api-js` | v7: transactions, key management, NEP-413 auth, meta-tx/relayer, FT/NFT | James (backend) |
| `near-kit` | More concise TS alternative, plus React hooks and sandbox testing | James / Ancung |
| `near-dapp` | `create-near-app`, `@hot-labs/near-connect`, `near-connect-hooks` | Ancung (FE) |
| `near-intents` | 1Click API: quote, per-chain deposits, status, swap widget, confidential swaps, Hyperliquid | Trader Mind / wallet |
| `near-cli-rs` | CLI commands: accounts, deploy, staking, signing (Ledger/MPC) | Everyone |

Note: the repo README lists only 6 skills. `near-cli-rs` and `near-contract-audit` exist in the folder but are not mentioned in the README.

**How other team members install them:**
```bash
npx skills add near/agent-skills -g                  # all, global
npx skills add near/agent-skills --skill near-dapp   # a single skill
```

### 6.2 Idea: NEAR skills as runtime skills for Minds

Mastra supports `SKILL.md` natively. That means NEAR skills could be adapted into skills a Mind equips, not only tools for the dev team:

- `near-intents` → a "Cross-chain Swap" skill for the Superior Trader Mind.
- `near-ai-cloud` → reference for "Verified Private" (an engine feature, not a Mind skill).

These skills are written for coding agents, so they need adapting (trimming, adding tool bindings to the OutLayer/1Click APIs).

Third-party skills outside the `near` org that also fit Mind runtime:

- `https://skills.outlayer.ai/agent-custody/SKILL.md`: policy-bound agent wallet. **[V]**
- `https://market.near.ai/skill/...`: A2A + x402 flows on the Agent Market. **[V]**

### 6.3 Other relevant `near` repos

| Repo | Use |
|---|---|
| `create-near-app` | FE scaffold: Next.js App Router or Vite React + NEAR Connect + near-api-js. Contract scaffold: Rust + near-sandbox. Node 22.22.2+/24.15+/26+ |
| `near-sandbox-js` | Local node for integration tests |
| `near-sdk-rs`, `cargo-near` | Contract SDK and build tooling |
| `near-api-js`, `near-api-ts` | Client libraries |
| `intents` | NEAR Intents contracts (verifier `intents.near`) |
| `mpc` | MPC node for chain signatures (reference only) |
| `near-cli-rs` | CLI |
| `docs` | Source of docs.near.org |

**Not** relevant:

- `near/near-intents`: just the NEAR Intents marketing landing page.
- Internal dev skills in `nearcore/.claude/skills/*`, `near-api-ts/skills/*`, `docs/.agents/skills/mintlify`.

---

## 7. AI engine options

Repo: `hellonear-ai-engine` (still empty).

### 7.1 Mastra — **primary proposal**

- **Versions** **[V]**: `@mastra/core` 1.79.0 (25 Oct 2026), `@mastra/memory` 1.39.0, `@mastra/mcp` 2.5.0, `@mastra/pg` 1.32.0, `@mastra/libsql` 1.27.0, `@mastra/ai-sdk` 1.11.2.
- **Activity** **[V]**: ~29k stars, near-daily releases.
- **License** **[V]**: Apache-2.0, **except the `ee/` folders** (auth ee, agent-builder ee, editor ee) under an enterprise license. Don't depend on the Editor or Agent Builder.

Features that map directly onto HelloMinds concepts **[V]**:

| HelloMinds need | Mastra feature |
|---|---|
| Mind templates + per-user customisation | **Dynamic agents**: `instructions`, `model`, `tools`, `memory`, `agents`, `scorers` can be async functions receiving `requestContext`. One generic Agent, config loaded from the DB per request |
| Equipped skills | **Skills** per the Agent Skills spec (`SKILL.md`): `createSkill()` for DB-backed skills, filesystem skills, and dynamic skills. The agent gets `skill`, `skill_read`, `skill_search` tools so playbooks load only when needed |
| Memory (RAM/Episodes/Tenets) | Message history (RAM), vector **semantic recall** (Episodes), **working memory** as a structured profile (Tenets/Priors), and Observational Memory. `resource` and `thread` scopes. Storage: Postgres, LibSQL, MySQL, MongoDB |
| Passive Autonomous Mode | **`mastra.schedules.create({ agentId, cron, prompt, threadId, resourceId, timezone })`** with CRUD (pause, resume, run, delete), persisted in storage. Available since core 1.50 |
| Circles / Lead + Expert Mind | **Supervisor agents**: subagents as tools, with delegation hooks, memory isolation, tool-approval propagation, and background subagents. ⚠️ `.network()` is **deprecated**; don't use it |
| Guardrails | Input/output processors + tool approval (human-in-the-loop) |
| Third-party skills | **MCPClient** (stdio, Streamable HTTP, OAuth) and **MCPServer** |
| Telegram | **Channels**: Telegram, Slack, Discord, WhatsApp adapters, with in-chat approvals |
| Brain / model routing | `model: { id: 'custom/<model>', url: 'https://cloud-api.near.ai/v1' }` or a custom `MastraModelGateway`. The model can be chosen dynamically per Mind |
| Deterministic workflows | Workflows with suspend/resume, snapshots, HITL, cron |
| Observability | Tracing, evals/scorers, Studio |
| FE integration | AI SDK UI (`chatRoute()`, `handleChatStream()`) |
| Deployment | Node server, Vercel, Cloudflare, Lambda, EC2, Inngest, Temporal |

**Weaknesses:**

- The API moves fast (e.g. network deprecated, MCP bumped to v2). **Pin versions** during the hackathon.
- TypeScript only.

### 7.2 n8n — **proposal: don't use it in the product**

- n8n 2.44.6 (23 Oct 2026), ~208k stars. **[V]**
- **Sustainable Use License** **[V]**: *"You may use or modify the software only for your own internal business purposes or for non-commercial or personal use."* `.ee.` files require an enterprise license.
- In practice: running n8n as the engine of a multi-tenant product, where users run Minds with their own credentials, is **not covered by the free license**. That path needs an Embed/OEM license. The docs show the path exists **[V]**; pricing and terms **[UV]**.
- Its data model is workflow-centric and single-tenant. No concept of a Soul, per-user memory, or a skill marketplace.
- What makes n8n attractive (scheduling, app integrations, workflows) is already covered by Mastra (schedules, workflows) and Composio (integrations).
- **If the team still wants it:** only for internal team automation (alerts, ops), outside the engine repo.

**Answer to the original question "Mastra, n8n-style workflows, or combine?":** the proposal is **Mastra only**. Mastra workflows already give us the "n8n-like" part (deterministic steps, suspend/resume, cron) inside one TS codebase. If the team wants a visual n8n-style editor for a "skill builder" demo, that can be a UI feature on top of Mastra workflows, not n8n.

### 7.3 Other frameworks (considered, not proposed)

| Option | Version | Why not |
|---|---|---|
| Vercel AI SDK | `ai` 7.0.153, has `ToolLoopAgent` **[V]** | Primitives only (no memory, scheduler, storage). Mastra is built on top of it |
| LangGraph | JS 1.5.2 / Py 1.2.17 **[V]** | Strong for graphs and checkpoints **[UV]**, but long-term memory and scheduling must be assembled or come from LangGraph Platform |
| OpenAI Agents SDK | JS 0.21.0 / Py 0.24.0 **[V]** | Still pre-1.0, no persistent memory or scheduler **[UV]** |
| Claude Agent SDK | TS 0.3.310 **[V]** | Claude-model oriented, a poor fit for OpenAI-compatible NEAR AI |
| Google ADK | TS 2.3.0 / Py 2.13.0 **[V]** | Gemini/Vertex-centric **[UV]** |
| VoltAgent | core 2.11.0, MIT **[V]** | Similar to Mastra, smaller ecosystem; last activity a month ago |
| ElizaOS | 1.7.2 (Jun 2026), v2 still alpha **[V]** | Popular for crypto agents and character files, but stable releases have stalled and its plugin model fits a per-user skill marketplace poorly |
| Letta | client 1.12.1 **[V]** | Good stateful memory, but needs a separate server; Mastra memory already covers it |

### 7.4 Third-party app integrations

| Option | Free tier | Notes |
|---|---|---|
| **Composio** (proposed) | 100K tool calls + 50K triggers per month, unlimited connected accounts; Composio-owned OAuth apps limited to the first 20K calls / 1K connections **[V]** | Official `@composio/mastra` 0.10.6 provider (per-`userId` sessions). Used by HelloMinds |
| Arcade | 2,000 auths + 2,000 tool calls per month **[V]** | Too small for a demo |
| Pipedream Connect | Free tier is development-only **[V]** | Startup plan $99/month |
| Nango | Free, then $50/month **[V]** | Better suited to data sync |

### 7.5 Shape of a HelloNear Bazaar skill (proposal)

Following the Agent Skills spec (https://agentskills.io/specification) **[V]**: a folder with `SKILL.md` (frontmatter `name`, `description`, optional `license`, `compatibility`, `metadata`, `allowed-tools`) + `references/` + scripts.

Mapping to the four HelloMinds skill components:

```
skill = {
  SKILL.md            # Skill Playbook (how it behaves)
  listing             # Registry Offering (name, description, price, author, version)
  toolBindings        # Tool Schemas: composio actions | MCP server URL | native tool id
  requiredConnections # App Manifest: gmail, calendar, near-wallet, ...
}
```

When equipped, `SKILL.md` is loaded via `createSkill()` and `toolBindings` are resolved by the tool registry.

---

## 8. Proposed architecture

> Draft, to be discussed with James (backend/devops).

### 8.1 Big picture

```
┌────────────── Frontend (Next.js, Ancung) ───────────────┐
│ Landing (Nabil) · Choose a Mind · Chat · Bazaar ·        │
│ Wallet & Policy panel · Circles · "Verified private" badge│
│ NEAR Connect (@hot-labs/near-connect) + NEP-413 login    │
└───────────────┬──────────────────────────────────────────┘
                │ REST/WebSocket
┌───────────────▼──────────── Backend (James) ────────────┐
│ Auth (near-sign-verify) · Users · Minds CRUD · Bazaar   │
│ Billing · Postgres (+pgvector) · OutLayer integration    │
└───────┬───────────────────────────────┬──────────────────┘
        │ {userId, mindId, threadId}    │ near-api-js
┌───────▼──── hellonear-ai-engine ────┐ │
│ Mastra server (see 8.2)             │ │
└──┬───────────┬───────────┬──────────┘ │
   │           │           │            │
NEAR AI     Composio    OutLayer API   NEAR registry contract (Axel)
Cloud (TEE) (Gmail..)   (wallet+policy) Mind↔owner↔wallet↔skills
                            │
                     NEAR Intents (swap) · Agent Market (x402 earn)
```

### 8.2 `hellonear-ai-engine` modules

```
HTTP (Mastra server / chatRoute) ← backend sends {userId, mindId, threadId}
 └─ middleware → requestContext.set(userId, mindId, mindConfig)

mind-registry  : minds table (template_id, soul, model, equipped_skills, connections, wallet_id)
                 + seed templates: Sales, Superior Trader, General Assistant, Email Manager, Game Designer
soul-builder   : instructions: async ({requestContext}) => identity + invariants (guardrails)
                 + priors + active skill summary; guardrails via input/output processors
skill-loader   : skills: async ctx => mind.skills.map(s => createSkill(SKILL.md from DB))
tool-registry  : tools: async ctx => merge(
                   composio.tools(userId) filtered per skill,
                   MCPClient per skill,
                   native: memory, wallet (OutLayer), delegate, agent-market)
memory         : Memory({ storage: PgStore, vector: PgVector,
                   workingMemory (resource = userId:mindId), semanticRecall, observational })
                 embeddings: NEAR AI Qwen3-Embedding
scheduler      : mastra.schedules.create(...) from the "Autopilot" UI (Passive Autonomous Mode)
circles        : dynamic supervisor agent; members = other Minds in the Circle; ACL checked before delegating
wallet-tool    : near_balance / near_transfer / swap via OutLayer API;
                 mandatory tool approval (HITL) + OutLayer on-chain policy
brain          : per-Mind model router (glm-5.3-flash default, kimi/glm-5.3 for reasoning),
                 fallback provider if needed
verify         : store response id → verifyResponse() → badge in the UI
observability  : Mastra tracing + a simple scorer for the demo
```

### 8.3 Registry contract (Axel, Rust near-sdk) — draft

- `register_mind(mind_id, metadata_uri, wallet_address)` → owner = `predecessor`.
- `equip_skill(mind_id, skill_id)` / `unequip_skill`.
- `publish_skill(skill_id, metadata_uri, price)`. Skill payments can come later (optional).
- Views: `get_mind`, `minds_of(owner)`, `get_skill`.
- Custody logic is **not** written by us (use OutLayer).
- Run the `near-contract-audit` skill before submission.

### 8.4 Candidate demo flow (draft)

1. Log in with a NEAR wallet → pick the "Superior Trader" template → name it → the Mind is registered on-chain and gets an OutLayer wallet.
2. Set a policy: max 5 USDC per day, whitelist only. The policy is visible on-chain.
3. Chat → every reply shows a "Verified private (TEE)" badge.
4. Ask the Mind to swap → succeeds under the limit. Then ask for more than the limit → **rejected on-chain** even when the prompt tries to force it. This is the key moment for the security track.
5. The Mind takes a job on the NEAR AI Agent Market → earns USDC (agent-economy proof).
6. Bonus: a Circle — a Research Mind delegates to a Writer Mind.

---

## 9. Proposed team split and timeline

| Person | Role | Focus |
|---|---|---|
| **Ancung** | FE | Next.js app: Choose a Mind, chat (AI SDK UI), Bazaar, wallet/policy panel, Circles. Start from `create-near-app --frontend next-app` |
| **Nabil** | Landing + design | Landing page, Mind characters (collector toy-box style), design system, demo video assets |
| **Axel** | SC + AI engine | Registry contract; Mastra engine (mind registry, soul, skills, memory, scheduler, circles); adapting NEAR skills |
| **James** | BE + devops + engine decision | API, Postgres+pgvector, NEP-413 auth, OutLayer and Composio integration, deployment, CI, integration/load tests |

Rough timeline (still a draft):

- **Before 1 Nov:** lock the idea and scope, apply for NEAR AI Cloud credits, request a 1Click API key, try OutLayer on testnet, smoke-test Mastra + NEAR AI.
- **Week 1 (1–7 Nov):** basic engine (registry, soul, memory, one model), registry contract on testnet, FE login + chat, landing page.
- **Week 2 (8–14 Nov):** skills + Bazaar, wallet + policy, scheduler, Circles (if time allows), Agent Market, local integration/load tests, README for AI judges, demo video, X post, submission.

Reminder: no push to main, merge, deploy, PR, or submission without Axel's approval.

---

## 10. Unproven, must test

| Item | Why it matters | How to test |
|---|---|---|
| Tool calling of NEAR AI models (GLM/Kimi/Qwen) through Mastra | Every skill depends on tool calling | Smoke test: agent + 2 tools, check correct calls |
| Mastra's handling of `reasoning_content` (reasoning models) | Could break the stream or output | Test with glm-5.3 |
| How to pass the API key with the `{id, url}` form vs a custom gateway | Basic configuration | Try both |
| Whether `mastra.schedules` passes `requestContext` to dynamic agents | Per-Mind autonomous work | Create a schedule, check which Mind config is used |
| OutLayer flow on testnet: register, policy, transfer rejected above the limit | Core of the security demo | Manual curl test |
| Intents swaps are mainnet-only | The demo needs (small) real money | Decide as a team |
| Requirements for registering a worker on the Agent Market | The "earn" demo | Read `market.near.ai/llms.txt`, try registering |
| Quality of `@nearai/inference-sdk` (0.1.0, Node ≥24) | Very new SDK | Test `verifyResponse` |
| n8n Embed license terms | Only if the team still wants n8n | Ask n8n |
| Hackathon details from a third-party article ($250K prizes, 13 tracks) **[UV]** | The official HACKATHON.md does not mention prizes | Check the official site |

---

## 11. Open questions for the team

1. **Demo focus:** a consumer persona app like HelloMinds, or the agent economy (Minds earning on the Agent Market)? Or both with one main flow?
2. **Wallet:** OutLayer (fast, hackathon partner), or our own vault contract (more SC work, full control)?
3. **Demo network:** mainnet with small amounts (Intents is mainnet-only), or testnet only?
4. **Starting templates:** which ones do we build? Proposal of 3: General Assistant, Superior Trader, Sales/Email.
5. **Channels:** web chat only, or add Telegram (Mastra has an adapter)?
6. **Bazaar:** paid skills on-chain (NEAR/USDC), or a free catalog for the hackathon?
7. **Project name:** "HelloNear" or something else? (Must be unique in the hackathon; avoid looking like a copy of the HelloMinds/Animoca brand.)
8. **n8n:** does anyone still want it for something? If so, for what?
9. **Hosting:** where are the engine and backend deployed (James)?

---

## 12. Sources

**Hackathon**
- https://nearhackathon.com/HACKATHON.md

**HelloMinds**
- https://www.hellominds.ai/
- https://build.hellominds.ai/en, https://build.hellominds.ai/llms.txt
- https://build.hellominds.ai/en/faq
- https://build.hellominds.ai/agent-md/en/docs/get-started/cli.md (also `client-library.md`, `connect.md`)
- https://build.hellominds.ai/agent-md/en/docs/guides/building-skills.md, `.../guides/circles.md`
- https://build.hellominds.ai/en/inspirations/superior-trade-intern

**NEAR**
- https://docs.near.ai/llms.txt, https://docs.near.ai/cloud/quickstart.md, https://docs.near.ai/cloud/models.md, https://docs.near.ai/cloud/private-inference.md, https://docs.near.ai/cloud/inference-sdk/javascript.md
- https://raw.githubusercontent.com/nearai/nearai/main/README.md (deprecation)
- https://docs.near.org/getting-started/hackathons.md
- https://docs.near.org/ai/shade-agents/getting-started/introduction (deprecation)
- https://docs.near.org/protocol/accounts-contracts/access-keys.md, https://docs.near.org/protocol/accounts-contracts/gas-keys.md
- https://docs.near.org/chain-abstraction/chain-signatures.md
- https://docs.near.org/protocol/transactions/meta-tx.md
- https://docs.near.org/tools/near-api.md, https://docs.near.org/tools/near-connect.md, https://docs.near.org/tools/sdk.md
- https://docs.near-intents.org/integration/distribution-channels/1click-api/sdk.md, https://docs.near-intents.org/resources/fees.md
- https://outlayer.ai, https://app.outlayer.ai/docs/getting-started, https://skills.outlayer.ai/agent-custody/SKILL.md, https://github.com/out-layer/outlayer
- https://market.near.ai, https://market.near.ai/llms.txt, https://market.near.ai/skill/flows/a2a-x402.md, https://market.near.ai/.well-known/x402
- https://near.ai/blog/introducing-near-ai-agent-market
- https://github.com/near/agent-skills, https://github.com/near/create-near-app, https://github.com/near/near-sandbox-js, https://github.com/near/near-api-ts, https://github.com/near/intents

**AI engine**
- https://mastra.ai/llms.txt, https://mastra.ai/docs/server/request-context, https://mastra.ai/docs/skills, https://mastra.ai/docs/memory/overview, https://mastra.ai/docs/subagents, https://mastra.ai/docs/agents/networks, https://mastra.ai/reference/schedules/overview, https://mastra.ai/docs/connections/mcp, https://mastra.ai/docs/channels, https://mastra.ai/models, https://mastra.ai/models/gateways/custom-gateways
- https://github.com/mastra-ai/mastra/blob/main/LICENSE.md
- https://github.com/n8n-io/n8n/blob/master/LICENSE.md
- https://composio.dev/pricing, https://docs.composio.dev/providers/mastra
- https://agentskills.io/specification

---

*Method note:* the HelloMinds pages and the contents of the `github.com/near` repos were read directly. The NEAR and AI-engine research was done by two research subagents that read every URL above (via r.jina.ai, docs markdown, `gh api`, `npm view`, crates.io). The version numbers and prices they reported have not been individually re-checked. Verify before making final decisions.
