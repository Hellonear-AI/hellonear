---
title: Receipts and smart contracts
description: Every on-chain claim with its transaction: payments, policies, the verified registry contract and the swarm auction round.
---

Every link opens a public explorer or report. Nothing here needs an account.

### On NEAR testnet

| What happened | Transaction | What it proves |
|---|---|---|
| A Mind's wallet paid 0.01 NEAR after the owner approved, through the hosted stack | [`AKYYpkLq…`](https://testnet.nearblocks.io/txns/AKYYpkLq8XxjL4GKJqdGF5CVTLmjNh3AGEpz2rbcfyYT) | `Transfer` from the Mind wallet `83e05486…` to `lin1er.testnet`. The agent pays from its own wallet, never the owner's |
| An owner saved the Mind's limits, signed in Meteor | [`DhKqbLAX…`](https://testnet.nearblocks.io/txns/DhKqbLAX3zhH2tP3kJDx5Xsk8ZkMByfJbYLyWYyivXXZ) | `store_wallet_policy` on `outlayer.testnet`: the policy lives on chain, set by the owner, not by HelloNear |
| An owner froze the Mind's wallet | [`HHGf2pqG…`](https://testnet.nearblocks.io/txns/HHGf2pqGRGTEJuA7wn4R18swFC4ssL6XMyXyogFHkDgu) | `freeze_wallet` on `outlayer.testnet`: one signature stops every payment |
| A payment went through right after the UTC day reset of the daily limit | [`GUn5P1Dp…`](https://testnet.nearblocks.io/txns/GUn5P1DpuJ3XxMw2s9GJAecHR1BVuVtr4wQhTZ54RjG) | The daily cap is enforced by the wallet and resets at 00:00 UTC |
| The Mind registry contract upgraded to v0.3.0 | [`ESMY36Uo…`](https://testnet.nearblocks.io/txns/ESMY36UoFcdWuw5fbShbNx13Fvf2NB1z1qWWypJNyCwp) | `DeployContract` on `hellonear-registry.testnet`; `contract_source_metadata` answers version 0.3.0, NEP-330 |
| The same v0.3.0 redeployed from a reproducible build, then source-verified | [`DmidjQmo…`](https://testnet.nearblocks.io/txns/DmidjQmoN15bj2qctXaXDefAW5NGJZFBPqqPPFJoa6Qb) | `build_info` names the build image and commit `95c2b3d`; NearBlocks shows the contract as verified through SourceScan (code hash `GUxsMNJd…`) |
| A Mind equipped a published skill, paying its publisher | [`6diDXaAY…`](https://testnet.nearblocks.io/txns/6diDXaAYmT8pMtVemsv4xtmzSE8DW7WM5Uprim6aU2a5) | `equip_skill` on the registry |

A payment the policy refuses has **no transaction at all**: OutLayer refuses it in the TEE before signing. The app and the Mind never show a tx link for one.

### The registry contract's source is verified

`hellonear-registry.testnet` runs exactly the code in this repository at commit `95c2b3d`. It was built reproducibly (NEP-330) and verified through SourceScan, so anyone can rebuild it and get the same hash.

| | |
|---|---|
| **Status** | **Verified**. The [NearBlocks contract tab](https://testnet.nearblocks.io/address/hellonear-registry.testnet?tab=contract) shows the verified source, and its verify page answers "Contract already verified" |
| **Code hash on chain** | `GUxsMNJdJKoFq7VJawNeCwW7GjGZE6TpURPj13ojEnub` |
| **Deploy transaction** | [`DmidjQmoN15bj2qctXaXDefAW5NGJZFBPqqPPFJoa6Qb`](https://testnet.nearblocks.io/txns/DmidjQmoN15bj2qctXaXDefAW5NGJZFBPqqPPFJoa6Qb) (12 Nov 2026, code-only, state unchanged) |
| **Source** | [`Hellonear-AI/hellonear@95c2b3d`](https://github.com/Hellonear-AI/hellonear/tree/95c2b3d839357583224b4c8fa64b0f03cddc3f80), folder `sc` |
| **Build image** | `sourcescan/cargo-near:0.21.1-rust-1.96.0@sha256:ccb22bb4e677ed022d8b9d1aa1b32f0af52dd0471ef1c32e48dedbf68ee6ee17` |
| **Verifier** | SourceScan `v2-verifier.sourcescan.testnet`; its record holds the same code hash and the source on IPFS (`QmX4dYjf9v798uF4Uuf11EPMA83Le84sCg6UsmaGdgrMdc`) |

Check it without a browser (public RPC, no key). Each command should print the value in the table:

```sh
RPC=https://test.rpc.fastnear.com

# 1. The code hash deployed on the account
curl -s $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"hellonear-registry.testnet"}}' | jq -r .result.code_hash

# 2. The contract names its own source and build (NEP-330 contract_source_metadata)
curl -s $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"hellonear-registry.testnet","method_name":"contract_source_metadata","args_base64":"e30="}}' | jq -r '.result.result | implode | fromjson | .build_info'

# 3. SourceScan's verification record for the account
curl -s $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"v2-verifier.sourcescan.testnet","method_name":"get_contract","args_base64":"eyJhY2NvdW50X2lkIjoiaGVsbG9uZWFyLXJlZ2lzdHJ5LnRlc3RuZXQifQ=="}}' | jq -r '.result.result | implode | fromjson | .code_hash'
```

To rebuild it yourself (needs Docker): `git checkout 95c2b3d && cd sc && cargo near build reproducible-wasm`, then compare the SHA-256 (base58) of `target/near/hellonear_mind_registry.wasm` with the code hash above.

### The swarm auction: one real round on testnet

The group-buying auction contract (`sc/swarm`, rules in [`RULES.md`](https://github.com/Hellonear-AI/hellonear/blob/main/sc/swarm/RULES.md)) is deployed at **[`auction.hellonear-swarm.testnet`](https://testnet.nearblocks.io/address/auction.hellonear-swarm.testnet?tab=contract)**. It was built reproducibly from commit `64c9278`, and its **source is verified** through SourceScan (code hash `6Wn9K6b3DtoH4TnoXs2jx6zFzihdzFDQGw4ae2dzcCv1`, deploy [`FkvHpxf9…`](https://testnet.nearblocks.io/txns/FkvHpxf9ff8LBeMcLEqSbhmFUbhcx5PebyG3qzJdQAwo)). Every agent is its own sub-account of `hellonear-swarm.testnet`. Round 0 (13 Nov 2026) had 3 buyers wanting 6 "gpu-hours", a ceiling of 0.01 NEAR per unit, and 2 sellers bidding sealed asks:

| Step | Who | Transaction | What it shows |
|---|---|---|---|
| Open the round | `coordinator` | [`B4CFzH9o…`](https://testnet.nearblocks.io/txns/B4CFzH9oCH8smUfCbTeKD7hNLPAmCwgzegzmnodavQaj) | Ceiling 0.01 NEAR per unit, seller bond 0.01 NEAR, a fixed 3 min commit window and 2 min reveal window |
| Join with escrow | `buyer-1`, `buyer-2`, `buyer-3` | [`GdBiXyn4…`](https://testnet.nearblocks.io/txns/GdBiXyn44oTHPEtcdxiZNdE9xdCPjPqiJUbUniGuVLG6) [`Eo4m23zh…`](https://testnet.nearblocks.io/txns/Eo4m23zhYhpxGTMZB7FxAK7oZAp6rCLFJvkJnrDMRQJJ) [`cgt2zw9v…`](https://testnet.nearblocks.io/txns/cgt2zw9vewKo9HQQC9g8FJFcu5GXM3n9FBWWCzcheaY) | 2, 3 and 1 units, each paying units × ceiling into escrow |
| Sealed asks | `seller-1`, `seller-2` | [`CQUFGq7K…`](https://testnet.nearblocks.io/txns/CQUFGq7KoJ9VH5pi78GyvA84TLxrDTw1D8wgnuECmSH9) [`4FsTkdpw…`](https://testnet.nearblocks.io/txns/4FsTkdpwJDxX4xXxWp1jfxXo8pLtN1cQizdbMnjP67iN) | Only a SHA-256 commitment (round, seller, ask, capacity, salt) plus the bond. Nobody can see the price |
| Reveal | `seller-1`, `seller-2` | [`Gu7qQBFn…`](https://testnet.nearblocks.io/txns/Gu7qQBFnV8uUCgp3VgjxntrNzwSnczWLxsq6TLi3U6pw) [`4EPJqmC6…`](https://testnet.nearblocks.io/txns/4EPJqmC6dtzSGADFLnNqffo3DMkvxEmxVuTmbcFFuyyC) | 0.006 NEAR × 4 units and 0.008 NEAR × 5 units; each must hash to its commitment, and the bond comes back |
| Close (a buyer, not the organizer) | `buyer-2` | [`44guvtrj…`](https://testnet.nearblocks.io/txns/44guvtrj8riB75rgQiC1kfMsBQzYHQcmruR3cdA4eL5C) | All 6 units filled at **one clearing price, 0.008 NEAR**: seller-1 sold 4, seller-2 sold 2. Buyers paid 0.048 NEAR in total and sellers earned 0.048 NEAR |
| Withdraw | each agent | [`CNsVsstu…`](https://testnet.nearblocks.io/txns/CNsVsstuuumXzjLbjGTFWXEYVXtw1bDfcTsiej7PEy7s) [`E2Amtv9p…`](https://testnet.nearblocks.io/txns/E2Amtv9pnSWdLhQoFaXeZxuxrm8Jjhc8NBgLbcDMcnJC) [`APe2tSRJ…`](https://testnet.nearblocks.io/txns/APe2tSRJqZrcrKUMNhsKnMjvCFcMLfWD4ayHqSvpMgD2) [`3WYa3qLP…`](https://testnet.nearblocks.io/txns/3WYa3qLPAP57WCg5fM7ptgQ6QyKv31M6f7r66NWDGBw6) [`5qV7kPVS…`](https://testnet.nearblocks.io/txns/5qV7kPVSVV17KzvCZBLVbtHbM52ZDnrRtmtaM36V6f9w) | Buyers pull their change (0.004, 0.006 and 0.002 NEAR); sellers pull sales plus bond (0.042 and 0.026 NEAR) |

Read the round yourself: `get_round` with `{"round_id":0}` on `auction.hellonear-swarm.testnet` (public RPC, no key). The full 20-buyer, 5-seller simulation runs on a local sandbox: `cd sc/swarm && cargo test --test simulation -- --nocapture`.

### The proof behind a verified reply (NEAR AI Cloud TEE)

| | |
|---|---|
| **Claim** | The reply came from NEAR AI's gateway TEE, and every step was signed by the key that hardware vouches for. |
| **Where it is checked** | `engine/src/verify.ts`, before the badge is shown. The signatures, hashes (never the conversation) and Intel's TDX quote are kept on `run.verified`. |
| **Open it** | Verified badge → **View proof** → **Check it in TEE Explorer**. The backend uploads the Intel quote to Phala's TEE Attestation Explorer and the app opens the report. |
| **A real report** | [proof.t16z.com/reports/1b374e5b…](https://proof.t16z.com/reports/1b374e5b10031496c6c45bc7749038d7e7cd26a16996455f893b6b5dd44a9db2): **VERIFIED**. Its report data ends with that run's nonce (`…99e266`), and its MRCONFIG carries the compose hash (`877959253d…`) in our proof. |

### NEAR Intents quotes, signed by 1Click

| | |
|---|---|
| **Claim** | The numbers a Payments Mind shows for a cross-chain payment are NEAR Intents' own. |
| **How** | `crosschain_quote` calls 1Click `POST /v0/quote` with `dry: true`. 1Click signs every quote (ed25519); the engine checks it with the official SDK's `verifyQuoteSignature` and returns `proof: { signedBy1Click, signature, quoteHash, publicKey }`. |
| **Live quotes** | 10 USDC on NEAR → **9.99558 USDC on Base** (~22 s); 25 USDT on NEAR → **24.98 USDT on Solana** (~17 s). |
| **Tested** | `engine/test/crosschain.test.ts`: a real signed quote recorded from 1Click verifies; the same quote with `amountOut` changed by one unit does not. |
| **Honest caveat** | It is a quote: NEAR Intents has no testnet and HelloNear's wallets are on testnet, so nothing is sent, and the Mind says so in every reply. |

---
