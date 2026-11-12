---
title: Updates
description: Dated changes to HelloNear's security, verification and availability, each backed by the repository.
---

### Status page live, after two provider outages
Published 13 November 2026 · Availability

[status.hellonear.xyz](https://status.hellonear.xyz) checks HelloNear and its providers every 5 minutes. It was built after two outages from outside HelloNear's code in one night: NEAR AI embeddings hung, and NEAR Intents 1Click quotes timed out. Minds now say plainly when a provider is down and point to the status page.

### Swarm auction contract live and source-verified
Published 13 November 2026 · Contracts

`auction.hellonear-swarm.testnet` was built reproducibly from commit `64c9278` and verified through SourceScan (code hash `6Wn9K6b3DtoH4TnoXs2jx6zFzihdzFDQGw4ae2dzcCv1`). The 9 findings of the 13 Nov review were fixed before it was deployed, and round 0 ran on testnet. See [Swarm auction](/swarm-auction).

### Gas relayer live on the hosted demo
Published 13 November 2026 · Wallet

A NEP-366 relayer pays the gas for owners' `unequip_skill` and `set_wallet` calls to the registry, never a deposit, and refuses a bad request before sending it. See [Gas relayer](/relayer).

### Registry contract redeployed from a reproducible build
Published 12 November 2026 · Contracts

`hellonear-registry.testnet` v0.3.0 was redeployed code-only from a reproducible build of commit `95c2b3d` and verified through SourceScan (code hash `GUxsMNJdJKoFq7VJawNeCwW7GjGZE6TpURPj13ojEnub`, tx [`DmidjQmo…`](https://testnet.nearblocks.io/txns/DmidjQmoN15bj2qctXaXDefAW5NGJZFBPqqPPFJoa6Qb)).

### Check a verified reply on Phala's TEE Explorer
Published 12 November 2026 · Verification

**Check it in TEE Explorer** uploads a run's Intel quote and opens a report that reads VERIFIED. Only the quote leaves, no conversation text.

### View proof behind the Verified badge
Published 11 November 2026 · Verification

Every verified reply keeps its proof (signatures, hashes and Intel's TDX quote), and the owner can open it from the badge.

### Daily limit proven on testnet
Published 10 November 2026 · Wallet

A daily spending cap in the wallet policy was tested on a throwaway wallet: over the cap, OutLayer refuses before signing with no transaction; exactly at the cap goes through; a refused request does not count.

### Demo wallet replaced after its key was exposed
Published 8 November 2026 · Security

The demo Mind wallet's key was exposed, so the demo now uses a new wallet with a new key (`83e05486…`). The new key is kept only in gitignored `.env` files.
