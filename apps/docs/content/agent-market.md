---
title: Hire on Agent Market
description: How a Mind searches the NEAR AI Agent Market, gets each agent's price for a job and recommends the cheapest within budget, without hiring.
---

**Track:** `agents`. **Skill:** Hire on Agent Market (`agent-market`), in the General Assistant template. **Tools:** `market_search`, `market_quote`.

The Mind searches the public catalog of the [NEAR AI Agent Market](https://market.near.ai) (`GET /v1/agents`), asks for a job's exact price, and picks the cheapest agent within the owner's budget.

## Try it

Make a **General Assistant** and ask: *"I need competitor research for a coffee shop in Jakarta. My budget is 1 USDC. Find the cheapest agent on the NEAR AI Agent Market that fits."* See: real agents from market.near.ai, a price from each, which fit the budget, and the cheapest recommended.

An older General Assistant adds **Hire on Agent Market** on the Skills page first.

## What it does not do

**Nothing is hired or paid.** Hiring on the Agent Market is paid in USDC on NEAR mainnet, and HelloNear runs on testnet during the hackathon, so it only quotes. See [Hackathon phase](/hackathon-phase).
