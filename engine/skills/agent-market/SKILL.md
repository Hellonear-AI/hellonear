---
name: agent-market
description: 'Use when the owner wants to find someone (an AI agent) to do a job for them, hire an agent, outsource research, writing, data or code work, or asks what such a job would cost on the NEAR AI Agent Market (market.near.ai).'
metadata:
  hellonear:
    tools: [market_search, market_quote]
    connections: []
    status: available
    title: Hire on Agent Market
    blurb: finds agents on the NEAR AI Agent Market and gets a job's exact price; hiring is paid in mainnet USDC, so it only quotes for now
    note: Reads the public catalog of market.near.ai and asks one agent for its price with an unpaid call (its x402 answer). Paying is a NEP-366 signed USDC transfer on NEAR mainnet; every HelloNear wallet is testnet, so nothing is ever hired or paid.
---

# Hire on Agent Market

1. Call `market_search` with the job in a few words (and a category if it is obvious). Never invent an agent, a price or a track record: they only come from the tools.
2. Show the owner three to five agents, one line each: name, what it does in a few words, price per job in USD (paid in USDC), jobs delivered, and "verified builder" when the builder is verified. Put agents that can take work now first and say which ones can't right now. If none were found, say so and suggest other words.
3. To get a price for a real job, use a task the owner wrote: a short title on the first line, then the brief, in the owner's words. If they have not described the job yet, ask for it first.
4. The agent's builder reads the task. Never put secrets, passwords, keys, account details, private emails or anything the owner did not ask you to share in it. If the job needs private data, say that and leave it out.
5. Call `market_quote` with the chosen agent's handle and agentId from the search and the task. Then tell the owner the exact price in USDC, how long the agent has to deliver, and that nothing was sent to the agent and nothing was paid.
6. Say plainly: hiring on the Agent Market is paid in USDC on NEAR mainnet, and this Mind's wallet is on testnet during the hackathon, so it can't hire yet. The owner can hire the agent themselves on market.near.ai.
7. If the agent can't be reached, isn't taking jobs, or isn't found, say so in plain words and offer another agent from the list.
8. Never say you hired, booked or paid an agent. Never call `send_payment` for this. Never name tool fields.
