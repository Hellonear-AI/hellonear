# HelloNear: guide for judges

A 3-minute read covers what HelloNear does and where the proof is. Trying it needs nothing installed and no wallet. If you would rather run it on your own machine, [Run it locally](#run-it-locally) has the commands.

- **Web app:** https://app.hellonear.xyz (press *Continue as guest*)
- **Demo video:** https://x.com/hellonearai/status/2121301045540450520
- **Docs:** https://docs.hellonear.xyz
- **Trust Center:** https://trust.hellonear.xyz
- **Status:** https://status.hellonear.xyz
- **Full README:** [README.md](README.md)
- **Tracks entered:** AI Security & Defense (`security`), Privacy & Private AI (`privacy`), Agent Economy (`agents`), AI Swarms (`swarms`), Autonomous Business (`business`), Real-World Money (`realworld`)

> HelloNear is a hackathon prototype. Everything below runs on NEAR **testnet** with free test tokens. Nothing moves real money.

## HelloNear in one minute

An AI assistant that can pay is one prompt injection away from paying the wrong person. A rule in the system prompt ("never send more than X") is advice to the model, not a limit.

HelloNear gives each person a **Mind**: an AI assistant that reads their email, works in their apps and pays for things. The limits sit outside the model:

1. **Every payment asks the owner.** Without an approval (or a rule the owner turned on for small payments to listed addresses), the payment tool cannot run.
2. **The wallet enforces its own policy.** Each Mind has its own OutLayer wallet. Its per-payment limit, daily limit and allowed recipients are stored on NEAR and checked in a TEE before anything is signed. A payment over the limit is refused **even if the owner approved it**, and no transaction exists.
3. **Freeze.** One transaction, signed in the owner's own NEAR wallet, stops every payment.
4. **Private, verifiable AI.** Every model call runs on NEAR AI Cloud in a TEE. Each reply's signature is checked against the hardware attestation before the app shows "Verified", and anyone can open the proof on Phala's TEE Attestation Explorer.

**Both of HelloNear's contracts are source verified.** The Mind registry (`hellonear-registry.testnet`) and the swarm auction (`auction.hellonear-swarm.testnet`) were built reproducibly (NEP-330) and verified through SourceScan: NearBlocks shows the verified source on each contract tab, and anyone can rebuild them from this repository and get the same code hash. See [Contracts and proofs](#contracts-and-proofs).

## Things to try on the live site (5 minutes, free)

Open https://app.hellonear.xyz, press **Continue as guest** and pick the **Payments Mind**. A guest gets 20 messages, a sample inbox and calendar, and a shared test wallet with HelloNear's limits. Guest data is deleted after 7 days.

| Type this | What you should see |
|---|---|
| *Send 0.01 NEAR to lin1er.testnet* | An approval card with the amount, the recipient and the wallet's checks. Approve it: a receipt with a NEAR testnet transaction link |
| *Send 1 NEAR to lin1er.testnet*, then approve | `policy_denied`: refused before signing, no transaction and no tx link. The card already warned "blocked even if you approve" |
| *Send 10 USDC to 0x8ba1f109551bD432803012645Ac136ddd64DBA72 on Base.* | A NEAR Intents quote (what would arrive, the cost, the time), signed by 1Click, and the Mind saying nothing was sent |
| *Pay 0.001 NEAR to hellonear-registry.testnet.* | A warning that it is a smart contract and a question, no approval card |
| *Buy the gas price report, but I only want to pay 0.0006 NEAR. Haggle if it costs more.* | The sellers' prices, then **Made an offer**. The Mind buys at the agreed price or walks away; it never makes a second offer |

Then:

1. **Check the proof.** Under any reply, click **Verified via NEAR AI TEE gateway** → **View proof** → **Check it in TEE Explorer**. Phala's TEE Explorer opens on a report that reads VERIFIED.
2. **Try to trick it.** Open **Attack playground** and run a scenario. Each result says which layer stopped it: the model, the missing tool, the owner's approval, or the wallet policy.
3. **Spot the phishing email.** Make an **Email Manager** and ask *List my latest emails. Is any of them suspicious?* The phishing email is flagged and nothing is paid.
4. **Hire on the Agent Market (quote only).** Make a **General Assistant** and ask *I need competitor research for a coffee shop in Jakarta. My budget is 1 USDC. Find the cheapest agent on the NEAR AI Agent Market that fits.* Real agents from market.near.ai with their prices, the cheapest recommended, nothing hired (hiring is USDC on mainnet).

Signing in with your own NEAR wallet (Meteor is the one tested end to end) instead of as a guest gives your own Mind wallet, limits, freeze, rules and Autopilot. Your Mind may then only pay accounts on its list, so add `lin1er.testnet` and `testing7.testnet` before the haggle step.

## Transactions you can open

Every link opens the public NEAR testnet explorer. Nothing here needs an account.

| What happened | Transaction |
|---|---|
| A Mind's wallet paid 0.01 NEAR after the owner approved | [`AKYYpkLq…`](https://testnet.nearblocks.io/txns/AKYYpkLq8XxjL4GKJqdGF5CVTLmjNh3AGEpz2rbcfyYT) |
| An owner saved the Mind's limits, signed in Meteor (`store_wallet_policy`) | [`DhKqbLAX…`](https://testnet.nearblocks.io/txns/DhKqbLAX3zhH2tP3kJDx5Xsk8ZkMByfJbYLyWYyivXXZ) |
| An owner froze the Mind's wallet (`freeze_wallet`) | [`HHGf2pqG…`](https://testnet.nearblocks.io/txns/HHGf2pqGRGTEJuA7wn4R18swFC4ssL6XMyXyogFHkDgu) |
| A payment right after the daily limit reset at 00:00 UTC | [`GUn5P1Dp…`](https://testnet.nearblocks.io/txns/GUn5P1DpuJ3XxMw2s9GJAecHR1BVuVtr4wQhTZ54RjG) |
| A Mind equipped a published skill, paying its publisher (`equip_skill`) | [`6diDXaAY…`](https://testnet.nearblocks.io/txns/6diDXaAYmT8pMtVemsv4xtmzSE8DW7WM5Uprim6aU2a5) |
| The Mind registry contract redeployed from a reproducible build, then source-verified | [`DmidjQmo…`](https://testnet.nearblocks.io/txns/DmidjQmoN15bj2qctXaXDefAW5NGJZFBPqqPPFJoa6Qb) |
| Swarm auction round 0: opened by the coordinator | [`B4CFzH9o…`](https://testnet.nearblocks.io/txns/B4CFzH9oCH8smUfCbTeKD7hNLPAmCwgzegzmnodavQaj) |
| Swarm auction round 0: closed by a buyer, 6 units at one clearing price of 0.008 NEAR | [`44guvtrj…`](https://testnet.nearblocks.io/txns/44guvtrj8riB75rgQiC1kfMsBQzYHQcmruR3cdA4eL5C) |

A payment the policy refuses has **no transaction at all**: OutLayer refuses it in the TEE before signing.

Every step of the swarm auction round (joins with escrow, sealed asks, reveals, withdrawals) is in the README: [The swarm auction: one real round on testnet](README.md#the-swarm-auction-one-real-round-on-testnet).

## Contracts and proofs

| What | Where |
|---|---|
| Mind registry contract, v0.3.0: **source verified** (SourceScan, built from commit `95c2b3d`, code hash `GUxsMNJd…`) | [`hellonear-registry.testnet`](https://testnet.nearblocks.io/address/hellonear-registry.testnet?tab=contract) |
| Swarm auction contract, v0.1.0: **source verified** (SourceScan, built from commit `64c9278`, code hash `6Wn9K6b3…`) | [`auction.hellonear-swarm.testnet`](https://testnet.nearblocks.io/address/auction.hellonear-swarm.testnet?tab=contract) |
| A verified reply's TEE report (NEAR AI Cloud) | [proof.t16z.com/reports/1b374e5b…](https://proof.t16z.com/reports/1b374e5b10031496c6c45bc7749038d7e7cd26a16996455f893b6b5dd44a9db2) |
| How each track's requirements are met, with how to check | [README: Tracks](README.md#tracks) |
| Every security layer, with "do this, see that" | [README: Security model](README.md#security-model) |
| The team's own security audit (14 Nov): what was reviewed, the threat model, the attacks tried against the hosted API and what they found | [README: Security audit by the team](README.md#security-audit-by-the-team-14-nov-2026-ai-assisted) · [`docs/security/`](docs/security/README.md) |
| What stops one step short of real money on testnet, and why | [README: Hackathon phase](README.md#hackathon-phase-testnet) |

Check the registry's code hash without a browser (public RPC, no key). It should print `GUxsMNJdJKoFq7VJawNeCwW7GjGZE6TpURPj13ojEnub`:

```sh
curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"hellonear-registry.testnet"}}' | jq -r .result.code_hash
```

## Try it through the API

Everything the web app does is a public HTTP API on `https://api.hellonear.xyz`:

```sh
B=https://api.hellonear.xyz
curl -s -c jar -X POST $B/v1/auth/demo -H 'content-type: application/json' -d '{}'   # guest session: 201, "demo": true
curl -s -b jar $B/v1/templates                                                         # email-manager, general-assistant, payments-mind
```

The full walkthrough is in [README: Through the API](README.md#through-the-api), and every route is in [`docs/openapi.json`](docs/openapi.json) and on https://docs.hellonear.xyz.

## Run it locally

Needs Node 24.22.1 or later, Bun, Docker and a NEAR AI Cloud API key. The commands are in [README: Run locally](README.md#run-locally).

Tests: `bun run test` in `engine/` and `apps/be/`, `bun run test` in `apps/fe/`, `cargo test` in `sc/`. The swarm simulation (20 buyers, 5 sellers) runs on a local sandbox: `cd sc/swarm && cargo test --test simulation -- --nocapture`.

## If something doesn't work

| Problem | What to do |
|---|---|
| The Mind stops answering after many messages | A guest session has 20 messages. Start a new guest session, or sign in with a NEAR testnet wallet |
| The wallet does not open | Allow pop-ups for the site and make sure the wallet is on **testnet** |
| A payment you approved was refused | That is the wallet policy working: over the limit or to an address not on the list. No transaction is created |
| The Mind declines a payment it could have put on a card | Model behaviour varies between runs. Ask again; the approval and the wallet policy, not the model, decide what is paid |
| Something looks down | https://status.hellonear.xyz shows whether HelloNear and each service it uses are answering |

## Good to know

- Everything runs on NEAR testnet. NEAR Intents has no testnet, so cross-chain payments are real signed quotes, never sent.
- Agent Market agents are real and priced live, but nobody is hired, because the market is paid in USDC on mainnet.
- The AI runs on the team's own NEAR AI Cloud credits, so judges pay nothing. Because that credit is shared, usage is limited during the hackathon (20 messages per guest, 60 runs an hour per account, Autopilot at most every 15 minutes); over a limit the API answers `429`. On mainnet each owner pays from their own credits and these limits go away.
- More detail: [README.md](README.md), https://docs.hellonear.xyz and https://trust.hellonear.xyz.
