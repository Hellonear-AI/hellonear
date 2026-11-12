---
title: Trust Center
description: How HelloNear keeps an AI agent's money rules out of the model's reach, with every claim linked to something you can check yourself.
---

HelloNear gives a person an AI agent that can pay, so the limits that matter sit outside the model: the owner approves, the wallet's policy is checked in a TEE before signing, and every reply carries a proof from NEAR AI Cloud's TEE. This Trust Center lists what is protected, how, and where to check it, without asking you to take our word for it.

## Scope and controls

What each part of HelloNear is covered by. Every "Yes" links to its proof. "N/A" means the control does not apply to that part.

| Scope | TEE-verified | Policy enforced before signing | Source verified (NEP-330, SourceScan) | Source public | Testnet only |
|---|---|---|---|---|---|
| Chat inference (NEAR AI Cloud) | [Yes](https://proof.t16z.com/reports/1b374e5b10031496c6c45bc7749038d7e7cd26a16996455f893b6b5dd44a9db2) | N/A | N/A | [Yes](https://github.com/Hellonear-AI/hellonear/blob/main/engine/src/verify.ts) | N/A |
| Mind wallet (OutLayer) | N/A | [Yes](https://testnet.nearblocks.io/txns/DhKqbLAX3zhH2tP3kJDx5Xsk8ZkMByfJbYLyWYyivXXZ) | N/A | [Yes](https://github.com/Hellonear-AI/hellonear/blob/main/apps/be/src/wallets.ts) | [Yes](https://github.com/Hellonear-AI/hellonear#hackathon-phase-testnet) |
| Mind registry contract | N/A | N/A | [Yes](https://testnet.nearblocks.io/address/hellonear-registry.testnet?tab=contract) | [Yes](https://github.com/Hellonear-AI/hellonear/tree/main/sc) | [Yes](https://testnet.nearblocks.io/address/hellonear-registry.testnet) |
| Swarm auction contract | N/A | N/A | [Yes](https://testnet.nearblocks.io/address/auction.hellonear-swarm.testnet?tab=contract) | [Yes](https://github.com/Hellonear-AI/hellonear/tree/main/sc/swarm) | [Yes](https://testnet.nearblocks.io/address/auction.hellonear-swarm.testnet) |
| Hosted demo (app and API) | N/A | N/A | N/A | [Yes](https://github.com/Hellonear-AI/hellonear) | [Yes](https://github.com/Hellonear-AI/hellonear#hackathon-phase-testnet) |

"Source public" means the code is published to be read and run locally; the license is all rights reserved, not an open-source license ([LICENSE](https://github.com/Hellonear-AI/hellonear/blob/main/LICENSE)). The hosted API names the commit it runs at [api.hellonear.xyz/v1/health](https://api.hellonear.xyz/v1/health) (`revision`).

## Controls

HelloNear holds no compliance certification. These are the controls that exist in the code, each with where to check it.

### Owner approval for every payment
Nothing is paid until the owner approves, in the app or in Telegram, unless the owner turned on a rule for small payments to listed addresses. See [Wallet, limits and approvals](/wallet-and-approvals).

### Wallet policy checked in a TEE
Per-payment limit, daily limit and allowed addresses are stored on NEAR and checked by OutLayer in a TEE before signing. A refused payment has no transaction. [Policy tx](https://testnet.nearblocks.io/txns/DhKqbLAX3zhH2tP3kJDx5Xsk8ZkMByfJbYLyWYyivXXZ).

### Freeze in one signature
The owner signs one transaction and every later payment ends `wallet_frozen`. [Freeze tx](https://testnet.nearblocks.io/txns/HHGf2pqGRGTEJuA7wn4R18swFC4ssL6XMyXyogFHkDgu).

### Verified replies
Each reply's signature is checked against NEAR AI Cloud's TEE attestation before the badge shows, and the proof opens on Phala's TEE Explorer. See [Verified replies](/verified-replies).

### Secrets the model never sees
API keys are encrypted with AES-256-GCM and filled in only by the tool, for the hosts the owner listed. A test scans every table for them. See [Connections and keys](/connections).

### Verified contract source
Both contracts were built reproducibly and verified through SourceScan, so anyone can rebuild them and compare the code hash. See [Receipts and smart contracts](/contracts).
