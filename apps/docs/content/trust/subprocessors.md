---
title: Subprocessors
description: The third-party services HelloNear uses, what each one does, and what data it receives.
---

Services outside HelloNear that receive data when you use it. Each entry says what it is for and what it gets.

### NEAR AI Cloud
- **Function:** language model and embeddings
- **Runs in:** a TEE; each reply is verified against the attestation
- **Used for:** every chat reply, workflow step and memory search. Prompts and replies are processed inside the TEE.

### OutLayer
- **Function:** the Mind's wallet
- **Runs in:** a TEE; NEAR testnet (`testnet-api.outlayer.ai`)
- **Used for:** signing payments after the wallet policy is checked. Receives the payment's amount and recipient.

### Composio
- **Function:** app connections (OAuth)
- **Runs in:** Composio's hosted service
- **Used for:** Gmail, Google Calendar and Meet, Sheets, Drive, Docs, Notion, Slack, Discord, Outlook, HubSpot and Zoom. Stores and refreshes the OAuth tokens; the tools read and write the owner's app data through it.

### AgentMail
- **Function:** a Mind's own email inbox
- **Runs in:** AgentMail's hosted service
- **Used for:** only Minds with the `email-address` skill. Receives the emails that Mind sends and receives.

### NEAR Intents (1Click)
- **Function:** cross-chain payment quotes
- **Runs in:** NEAR Intents' hosted API
- **Used for:** dry quotes only (`dry: true`); nothing is sent. Receives the amount, tokens, chains and addresses of the quote.

### NEAR AI Agent Market
- **Function:** catalog of agents and their prices
- **Runs in:** market.near.ai
- **Used for:** the Hire on Agent Market skill. A search sends the search terms; a quote sends the job description to the chosen agent. Nothing is hired or paid.

### FastNear RPC
- **Function:** NEAR testnet RPC
- **Runs in:** NEAR testnet (`test.rpc.fastnear.com`)
- **Used for:** account lookups, payment checks, the relayer and the status checks. Receives public account names and transaction hashes.

### Phala TEE Attestation Explorer
- **Function:** public report for a TEE quote
- **Runs in:** proof.t16z.com
- **Used for:** only when the owner clicks **Check it in TEE Explorer**. Receives the Intel quote, no conversation text; the report is public.

### Vercel
- **Function:** web hosting
- **Runs in:** Vercel
- **Used for:** status.hellonear.xyz, and this docs and trust site.

### Cloudflare
- **Function:** DNS and tunnel
- **Runs in:** Cloudflare
- **Used for:** the public names `hellonear.xyz`, `app.hellonear.xyz` and `api.hellonear.xyz`, through a Cloudflare Tunnel to the hosted demo.

### Telegram
- **Function:** chat bot (optional)
- **Runs in:** Telegram
- **Used for:** only Minds whose owner linked a bot. Receives the owner's messages to the bot, the Mind's replies and approval cards.
