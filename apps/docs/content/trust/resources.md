---
title: Resources
description: Documents and commands to check HelloNear's claims yourself, grouped by verification, contracts, API and security.
---

## Verification

- [Receipts: check them yourself](https://github.com/Hellonear-AI/hellonear#receipts-check-them-yourself): every on-chain claim with its transaction.
- [A verified reply's TEE Explorer report](https://proof.t16z.com/reports/1b374e5b10031496c6c45bc7749038d7e7cd26a16996455f893b6b5dd44a9db2): reads VERIFIED.
- [Verified replies](/verified-replies): badge levels and what the proof holds.
- [How the NEAR Intents quotes are checked](https://github.com/Hellonear-AI/hellonear#near-intents-quotes-signed-by-1click): 1Click's signature, checked with the official SDK.

## Contracts

- [Registry contract: verify it without a browser](/contracts#the-registry-contracts-source-is-verified): three RPC commands that print the code hash, the build info and SourceScan's record.
- [Registry contract interface](https://github.com/Hellonear-AI/hellonear/blob/main/sc/README.md): methods, events and upgrade rules.
- [Swarm auction rules](https://github.com/Hellonear-AI/hellonear/blob/main/sc/swarm/RULES.md): the round, the bond and who can close.
- [Swarm auction safety choices](https://github.com/Hellonear-AI/hellonear/blob/main/sc/swarm/README.md): the 9 findings of the 13 Nov review and how each was fixed.
- [Swarm simulation report](https://github.com/Hellonear-AI/hellonear/blob/main/sc/swarm/simulation-report.md): 20 buyers, 5 sellers, money conserved every round.

## API

- [OpenAPI spec](/openapi.json), rendered in the [API reference](/api-reference).
- [API contract](https://github.com/Hellonear-AI/hellonear/blob/main/docs/api-contract.md): every route, field and event.
- [Streaming events](/events) and [Errors](/errors).
- [Status page](https://status.hellonear.xyz) and its data at [GET /v1/status](https://api.hellonear.xyz/v1/status).

## Security

- [Security model](https://github.com/Hellonear-AI/hellonear#security-model): the layers and how to see each one stop an attack.
- [What is private, and what HelloNear keeps](/privacy).
- [Hosted demo setup](https://github.com/Hellonear-AI/hellonear/blob/main/deploy/README.md): firewall, tunnel, where keys live.
- [Report an issue](https://github.com/Hellonear-AI/hellonear/issues/new).
