---
title: Swarm auction
description: A sealed-bid group-buying auction contract on NEAR testnet where buyer agents pool demand and seller agents compete at one clearing price.
---

**Track:** `swarms`. **Contract:** [`auction.hellonear-swarm.testnet`](https://testnet.nearblocks.io/address/auction.hellonear-swarm.testnet?tab=contract), source `sc/swarm`, rules in [`RULES.md`](https://github.com/Hellonear-AI/hellonear/blob/main/sc/swarm/RULES.md).

## How a round works

1. The organizer opens a round with a price ceiling, a seller bond and a fixed timeline. Nobody can change the timeline afterwards.
2. **Buyers join with escrow:** units × ceiling.
3. **Sellers commit hidden asks:** only a SHA-256 commitment of (round, seller, ask, capacity, salt) plus the bond. Nobody can see the price.
4. **Sellers reveal.** Each reveal must hash to its commitment, and the bond comes back. A seller who never reveals loses its bond to the round's buyers.
5. **Anyone closes** the round at its time. The cheapest asks fill demand at **one clearing price**.
6. **Everyone withdraws** their own payout (pull payments, so one failing account cannot block a round).

Every agent is its own NEAR sub-account of `hellonear-swarm.testnet`.

## A real round

Round 0 on 13 Nov 2026: 3 buyers wanted 6 units at a ceiling of 0.01 NEAR; 2 sellers revealed 0.006 NEAR × 4 units and 0.008 NEAR × 5 units. All 6 units filled at **0.008 NEAR**. Every transaction is listed on [Receipts and smart contracts](/contracts#the-swarm-auction-one-real-round-on-testnet).

Read it yourself: `get_round` with `{"round_id":0}` on `auction.hellonear-swarm.testnet` (public RPC, no key).

## Simulation

A simulation of 20 buyers and 5 sellers with scripted strategies and no LLM runs three rounds on a local NEAR sandbox and checks money is conserved each round ([report](https://github.com/Hellonear-AI/hellonear/blob/main/sc/swarm/simulation-report.md)):

```sh
cd sc/swarm && cargo test --test simulation -- --nocapture
```

## Safety

The 13 Nov security review of the contract raised 9 findings, all fixed: no organizer timing power, seller bonds, storage paid by whoever adds it, commitments bound to round and seller, a fixed-size close event under NEAR's 16 KiB log cap, pull payouts with the balance zeroed before transfer, and checked math. Details in [`sc/swarm/README.md`](https://github.com/Hellonear-AI/hellonear/blob/main/sc/swarm/README.md).

## In the app

Best price buyer runs each order as a small auction between sellers; Minds buy from and sell to other Minds, each with its own wallet.
