---
title: Minds and templates
description: What a Mind is, the three templates it starts from, and what the owner can change afterwards.
---

A **Mind** is one AI agent with one job. It has a name and a voice (its persona), a memory of its owner, the skills it has equipped and, when it needs to pay, its own NEAR wallet. One owner can have several Minds.

## Templates

A Mind starts from a template. The template picks its starting skills; the owner can equip or remove skills afterwards on the Skills page.

| Template | `templateId` | Starting skills |
|---|---|---|
| **General Assistant** | `general-assistant` | Daily planner, Calendar conflicts, Health journal, Redact before send, Hire on Agent Market |
| **Payments Mind** | `payments-mind` | Payments, Daily planner, Recipient guard, Split bill, Treasury report, Spending audit, Best price buyer, Freeze advisor |
| **Email Manager** | `email-manager` | Email triage, Daily planner, Phishing detector, Follow-ups, Subscriptions & bills, Confidential reader, Calendar conflicts |

Templates live in `engine/templates/*.json`. All three use the model `z-ai/glm-5.3-flash` on NEAR AI Cloud by default ([The agent](/agent) lists the models).

## What the owner controls

- **Persona:** the name and the "soul" (how it talks). Changing either starts a fresh memory, so a renamed Mind does not carry the old persona's notes.
- **Skills:** which playbooks and tools it has. See [Skills and tools](/skills).
- **Memory:** read, edit or clear what it remembers, and switch off memory or the search of past chats. See [Privacy](/privacy).
- **Wallet:** limits, allowed addresses and Freeze. See [Wallet, limits and approvals](/wallet-and-approvals).
- **Approvals:** optional rules that skip the card for small payments to listed addresses, or for chosen actions.

## On chain

A Mind can be recorded in the **Mind registry contract** (`hellonear-registry.testnet`): Mind, owner, wallet address and equipped skills. It holds no money; the wallet lives in OutLayer and the contract only stores its address. See [Receipts and smart contracts](/contracts).

## Through the API

`GET /v1/templates` lists the templates; `POST /v1/minds` with `{ "templateId": "payments-mind", "name": "Penny" }` creates a Mind. See the [Quickstart](/quickstart) and the [API reference](/api-reference).
